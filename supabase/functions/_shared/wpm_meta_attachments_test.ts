import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { describeAttachments, isAcknowledgementOnly } from './wpm_meta_attachments.ts';

// Every fixture below is a real payload shape taken from wpm_webhook_events.

Deno.test('a shared reel carries its caption into the conversation', () => {
  const text = describeAttachments([{
    type: 'ig_reel',
    payload: {
      url: 'https://www.instagram.com/reel/DcUJddXCIKx/',
      title: 'Comment "TOKEN" and I\'ll send you the MCP setup and the full breakdown.',
      // deno-lint-ignore no-explicit-any
    } as any,
  }]);
  assertEquals(
    text,
    '[Shared an Instagram reel] Comment "TOKEN" and I\'ll send you the MCP setup and the full breakdown.',
  );
});

Deno.test('a very long caption is truncated, not dropped', () => {
  const long = 'a'.repeat(5000);
  const text = describeAttachments([{ type: 'ig_reel', payload: { title: long } }])!;
  assertEquals(text.startsWith('[Shared an Instagram reel] '), true);
  assertEquals(text.length < 1300, true);
});

Deno.test('a shared post carries its caption too', () => {
  assertEquals(
    describeAttachments([{ type: 'ig_post', payload: { title: 'Our new menu is live' } }]),
    '[Shared an Instagram post] Our new menu is live',
  );
});

Deno.test("Instagram's empty phone card yields nothing to answer", () => {
  // The exact live payload: the widget is rendered client-side, so `elements`
  // is empty and there is no content whatsoever.
  assertEquals(describeAttachments([{ type: 'template', payload: { generic: { elements: [] } } }]), null);
});

Deno.test('a template that really does carry elements is still described', () => {
  assertEquals(
    describeAttachments([{ type: 'template', payload: { generic: { elements: [{ title: 'x' }] } } }]),
    '[Sent a card]',
  );
});

Deno.test('a story mention is called out as the promotion it is', () => {
  assertEquals(
    describeAttachments([{ type: 'story_mention', payload: { url: 'https://cdn/x.jpg' } }]),
    '[Mentioned this business in their Instagram story]',
  );
});

Deno.test('photos and voice notes read like messages, not errors', () => {
  assertEquals(describeAttachments([{ type: 'image', payload: { url: 'https://cdn/x.jpg' } }]), '[Sent a photo]');
  assertEquals(describeAttachments([{ type: 'audio', payload: { url: 'https://cdn/x.mp4' } }]), '[Sent a voice message]');
});

Deno.test('a sticker alongside a photo adds nothing', () => {
  assertEquals(
    describeAttachments([
      { type: 'image', payload: { url: 'https://cdn/x.jpg' } },
      { type: 'sticker', payload: { url: 'https://cdn/s.png' } },
    ]),
    '[Sent a photo]',
  );
});

Deno.test('an unknown type with no caption contributes nothing', () => {
  assertEquals(describeAttachments([{ type: 'unsupported_type', payload: { url: 'https://cdn/x' } }]), null);
});

Deno.test('several shares in one delivery are all described', () => {
  assertEquals(
    describeAttachments([
      { type: 'ig_reel', payload: { title: 'first' } },
      { type: 'ig_reel', payload: { title: 'second' } },
    ]),
    '[Shared an Instagram reel] first\n[Shared an Instagram reel] second',
  );
});

// Real payload: William Martinez's 👍 on Skywake's Messenger, 2026-09-25 14:46
// (URL signature trimmed). Facebook sends the like as an IMAGE plus a duplicate
// STICKER, both carrying the fixed like sticker id. It was stored as
// "[Sent a photo]" and the agent pitched him a Discovery Flight.
const MESSENGER_LIKE = [
  { type: 'image', payload: { url: 'https://scontent.xx.fbcdn.net/v/t39.1997-6/39178562_1505197616293642_5411344281094848512_n.png', sticker_id: 369239263222822 } },
  { type: 'sticker', payload: { url: 'https://scontent.xx.fbcdn.net/v/t39.1997-6/39178562_1505197616293642_5411344281094848512_n.png', sticker_id: 369239263222822 } },
];

Deno.test('a Messenger like is a 👍, not a photo — described once', () => {
  assertEquals(describeAttachments(MESSENGER_LIKE), '[Sent a 👍]');
  assertEquals(isAcknowledgementOnly(undefined, MESSENGER_LIKE), true);
});

Deno.test('the small and large like stickers and the Instagram heart are likes too', () => {
  for (const sticker_id of [369239343222814, '369239383222810']) {
    assertEquals(isAcknowledgementOnly(null, [{ type: 'image', payload: { url: 'x', sticker_id } }]), true);
  }
  assertEquals(isAcknowledgementOnly(null, [{ type: 'like_heart' }]), true);
  assertEquals(describeAttachments([{ type: 'like_heart' }]), '[Sent a 👍]');
});

Deno.test('a real photo, another sticker, or a like WITH text is still answered', () => {
  assertEquals(isAcknowledgementOnly(null, [{ type: 'image', payload: { url: 'https://example.com/photo.jpg' } }]), false);
  assertEquals(describeAttachments([{ type: 'image', payload: { url: 'https://example.com/photo.jpg' } }]), '[Sent a photo]');
  assertEquals(isAcknowledgementOnly(null, [{ type: 'image', payload: { url: 'x', sticker_id: 126361874215276 } }]), false);
  assertEquals(isAcknowledgementOnly('¿Y cuánto cuesta?', MESSENGER_LIKE), false);
  // A like next to a real photo is a photo: the photo still deserves an answer.
  assertEquals(isAcknowledgementOnly(null, [...MESSENGER_LIKE, { type: 'image', payload: { url: 'https://example.com/p.jpg' } }]), false);
  assertEquals(isAcknowledgementOnly(null, []), false);
});
