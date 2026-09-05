import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { type MetaMessageEvent, normalizeMetaEvents } from './wpm_meta_normalize.ts';

const PAGE = '17841440758501262';
const CUSTOMER = '4569826076583257';

function entry(messaging: MetaMessageEvent[]) {
  return { id: PAGE, messaging };
}

/** An inbound customer message: sender is the customer. */
function inbound(text: string): MetaMessageEvent {
  return {
    sender: { id: CUSTOMER },
    recipient: { id: PAGE },
    timestamp: 1788185629044,
    message: { mid: 'mid.inbound', text },
  };
}

/**
 * An echo: the business sent it, so Meta swaps sender and recipient.
 * Shape copied from a real row in wpm_webhook_events (2026-08-09).
 */
function echo(text: string, mid = 'mid.echo'): MetaMessageEvent {
  return {
    sender: { id: PAGE },
    recipient: { id: CUSTOMER },
    timestamp: 1788185629044,
    message: { mid, text, is_echo: true },
  };
}

Deno.test('an echo is normalized instead of being discarded', () => {
  const out = normalizeMetaEvents(entry([echo('Estos son los precios que tenemos')]), 'instagram');

  assertEquals(out.length, 1);
  assertEquals(out[0].text, 'Estos son los precios que tenemos');
  assertEquals(out[0].isEcho, true);
});

Deno.test('an echo is attributed to the CUSTOMER, not the page', () => {
  // The whole defect in one assertion. Meta puts the page in `sender` on an
  // echo, so reading sender.id keys the conversation as pageId:pageId and the
  // message lands in a thread that belongs to no customer.
  const out = normalizeMetaEvents(entry([echo('hola')]), 'instagram');

  assertEquals(out[0].senderId, CUSTOMER);
  assertEquals(out[0].pageId, PAGE);
});

Deno.test('an inbound message still reads the customer from sender', () => {
  const out = normalizeMetaEvents(entry([inbound('¿Cuál es el costo?')]), 'instagram');

  assertEquals(out[0].senderId, CUSTOMER);
  assertEquals(out[0].isEcho, false);
});

Deno.test('an echo keeps its mid so the caller can de-duplicate our own sends', () => {
  // Every AI reply and Inbox reply echoes back too. Without the mid there is
  // no way to tell "the colleague typed this on their phone" from "we sent
  // this ourselves five seconds ago", and every bot reply would double.
  const out = normalizeMetaEvents(entry([echo('Looking fwd to it', 'mid.abc123')]), 'instagram');

  assertEquals(out[0].messageId, 'mid.abc123');
});

Deno.test('delivery and read receipts are still discarded', () => {
  const receipts: MetaMessageEvent[] = [
    { sender: { id: PAGE }, recipient: { id: CUSTOMER }, timestamp: 1, delivery: { watermarks: 1 } },
    { sender: { id: PAGE }, recipient: { id: CUSTOMER }, timestamp: 2, read: { watermark: 1 } },
  ];

  assertEquals(normalizeMetaEvents(entry(receipts), 'instagram').length, 0);
});

Deno.test('an attachment-only echo is described rather than dropped', () => {
  // A voice note sent from the phone arrives as an attachment with no text.
  // It is real context the agent otherwise never sees.
  const out = normalizeMetaEvents(
    entry([{
      sender: { id: PAGE },
      recipient: { id: CUSTOMER },
      timestamp: 1788185629044,
      message: {
        mid: 'mid.voice',
        is_echo: true,
        attachments: [{ type: 'audio', payload: { url: 'https://lookaside.example/a.mp4' } }],
      },
    }]),
    'instagram',
  );

  assertEquals(out.length, 1);
  assertEquals(out[0].isEcho, true);
  assertEquals(out[0].attachments[0].type, 'audio');
  assertEquals(typeof out[0].text, 'string');
});

// ── Facebook Messenger ─────────────────────────────────────────────────────
// The normalizer is platform-agnostic and must stay that way. Whether Meta
// DELIVERS a Messenger echo is a separate question the code cannot answer: it
// needs the `message_echoes` webhook field subscribed for the Page, which is
// not the same subscription as `messages`. No Messenger echo has ever been
// recorded in wpm_webhook_events. These tests pin the handling; the delivery
// has to be confirmed against live traffic.

const PSID = '9048123456789012';
const FB_PAGE = '432187430677024';

Deno.test('a Messenger echo is handled exactly like an Instagram one', () => {
  const out = normalizeMetaEvents(
    {
      id: FB_PAGE,
      messaging: [{
        sender: { id: FB_PAGE },
        recipient: { id: PSID },
        timestamp: 1788185629044,
        message: { mid: 'mid.fb.echo', text: 'Following up from my phone', is_echo: true },
      }],
    },
    'messenger',
  );

  assertEquals(out.length, 1);
  assertEquals(out[0].isEcho, true);
  assertEquals(out[0].platform, 'messenger');
  // The same sender/recipient swap applies on Messenger.
  assertEquals(out[0].senderId, PSID);
  assertEquals(out[0].pageId, FB_PAGE);
  assertEquals(out[0].messageId, 'mid.fb.echo');
});

Deno.test('an inbound Messenger message is unaffected', () => {
  const out = normalizeMetaEvents(
    {
      id: FB_PAGE,
      messaging: [{
        sender: { id: PSID },
        recipient: { id: FB_PAGE },
        timestamp: 1788185629044,
        message: { mid: 'mid.fb.in', text: 'Hi there' },
      }],
    },
    'messenger',
  );

  assertEquals(out[0].senderId, PSID);
  assertEquals(out[0].isEcho, false);
});

Deno.test('a mixed batch keeps both the customer message and the echo', () => {
  const out = normalizeMetaEvents(
    entry([inbound('No, prefiero más información aquí.'), echo('Entiendo, pero…')]),
    'instagram',
  );

  assertEquals(out.length, 2);
  assertEquals(out[0].isEcho, false);
  assertEquals(out[0].senderId, CUSTOMER);
  assertEquals(out[1].isEcho, true);
  assertEquals(out[1].senderId, CUSTOMER);
});

// ── Echoes we cannot read ────────────────────────────────────────────────
//
// Every payload below is copied from a real row that the pipeline DISCARDED.
// Find them with:
//   select created_at, error_message, raw_payload from wpm_webhook_events
//   where status='ignored'
//     and (raw_payload->'entry'->0->'messaging'->0->'message'->>'is_echo')='true';
//
// The caller drops any event with no text at meta-direct-webhook/index.ts:351,
// 190 lines before the echo branch at :541 — so an echo with nothing readable
// never reached the code written to store it.

Deno.test('an echo replying to a story is kept, not dropped for having no text', () => {
  // Real row: 2026-09-04 15:18:33 UTC. No text, no attachments, only reply_to.
  const out = normalizeMetaEvents(
    entry([{
      sender: { id: PAGE },
      recipient: { id: CUSTOMER },
      timestamp: 1788492000000,
      message: {
        mid: 'mid.story.echo',
        is_echo: true,
        reply_to: { story: { id: '17934571032364398', url: 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1' } },
      },
    }]),
    'instagram',
  );

  assertEquals(out.length, 1);
  assertEquals(out[0].isEcho, true);
  assertEquals(out[0].text, '[Replied to a story]');
  // Still the customer's thread, not pageId:pageId.
  assertEquals(out[0].senderId, CUSTOMER);
  assertEquals(out[0].messageId, 'mid.story.echo');
});

Deno.test('an echo carrying an attachment we have no case for is kept', () => {
  // Real rows: 2026-09-01 10:38 / 16:06 and 2026-09-02 15:30 UTC.
  // describeAttachments has no `unsupported_type` case, so it returns null.
  const out = normalizeMetaEvents(
    entry([{
      sender: { id: PAGE },
      recipient: { id: CUSTOMER },
      timestamp: 1788185629044,
      message: {
        mid: 'mid.unsupported',
        is_echo: true,
        attachments: [{ type: 'unsupported_type' }],
      },
    }]),
    'instagram',
  );

  assertEquals(out.length, 1);
  assertEquals(out[0].text, '[Sent an attachment (unsupported_type)]');
  assertEquals(out[0].isEcho, true);
});

Deno.test('an echo with nothing at all still records that something was sent', () => {
  const out = normalizeMetaEvents(
    entry([{
      sender: { id: PAGE },
      recipient: { id: CUSTOMER },
      timestamp: 1788185629044,
      message: { mid: 'mid.empty', is_echo: true },
    }]),
    'instagram',
  );

  assertEquals(out[0].text, '[Sent a message with no readable content]');
});

Deno.test('a readable echo is untouched — the placeholder is a fallback, not a rewrite', () => {
  const out = normalizeMetaEvents(entry([echo('Te llamo en 5 minutos')]), 'instagram');
  assertEquals(out[0].text, 'Te llamo en 5 minutos');
});

Deno.test('an INBOUND message with nothing readable is still dropped, deliberately', () => {
  // Scoping guard. Manufacturing text here would burn an OpenAI call, a
  // reply-cap slot and a free-grant message answering nothing — the trap
  // already recorded for Instagram's empty phone-card template. Three of the
  // four story replies dropped since 09-03 were inbound, not echoes; whether
  // THOSE deserve a reply is a product decision, not this fix.
  const out = normalizeMetaEvents(
    entry([{
      sender: { id: CUSTOMER },
      recipient: { id: PAGE },
      timestamp: 1788492000000,
      message: {
        mid: 'mid.story.inbound',
        reply_to: { story: { id: '18108989594162204' } },
      },
    }]),
    'instagram',
  );

  assertEquals(out.length, 1);
  assertEquals(out[0].isEcho, false);
  assertEquals(out[0].text, null); // the caller's guard at :351 still discards it
});
