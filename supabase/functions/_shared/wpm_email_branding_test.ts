import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';

/**
 * STRUCTURAL guard, not a behaviour test — it reads the source rather than
 * calling the senders, because every template's HTML is built inside a function
 * that immediately hands it to Resend, so there is nothing to capture without a
 * network call.
 *
 * It exists because the failure mode is silent and total: a logo URL that 404s
 * puts a broken-image icon at the top of every escalation, lead, trial and
 * deletion email we send, and nothing in the pipeline would report it. The same
 * reasoning as `meta-direct-webhook/escalation_call_site_test.ts`.
 */
const source = await Deno.readTextFile(new URL('./wpm_email.ts', import.meta.url));

Deno.test('every email template carries the brand header', () => {
  // One per template: escalation, the trial shell, qualified lead, deletion.
  const uses = source.match(/\$\{logoHeader\}/g) ?? [];
  assertEquals(uses.length, 4, 'all four templates must include the logo header');
});

Deno.test('the logo is served from the sending domain over HTTPS', () => {
  const url = source.match(/const LOGO_URL = '([^']+)'/)?.[1];
  assert(url, 'LOGO_URL must be defined');
  assertStringIncludes(url, 'https://');
  // Same registrable domain as alerts@wolfpackmediapr.com. A logo hotlinked
  // from an unrelated host is the case filters actually dislike.
  assertStringIncludes(url, 'wolfpackmediapr.com');
});

Deno.test('the logo degrades when a client blocks remote images', () => {
  const header = source.match(/const logoHeader = `([\s\S]*?)`;/)?.[1];
  assert(header, 'logoHeader must be defined');
  // Many clients block images by default, so alt text may be the first thing
  // the reader sees.
  assertStringIncludes(header, 'alt="WolfPack AI"');
  // Explicit dimensions stop the layout reflowing once the image loads.
  assertStringIncludes(header, 'width="48"');
  assertStringIncludes(header, 'height="48"');
  // Flattened onto white on purpose: the source mark is black on transparent
  // and vanishes in a dark-mode client.
  assertStringIncludes(header, 'background:#ffffff');
});
