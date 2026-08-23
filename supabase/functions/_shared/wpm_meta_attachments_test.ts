import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { describeAttachments } from './wpm_meta_attachments.ts';

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
