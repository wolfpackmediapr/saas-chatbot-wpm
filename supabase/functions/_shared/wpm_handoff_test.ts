import { assertEquals } from 'jsr:@std/assert';
import { matchEmergencyKeyword, stripHandoffSignal } from './wpm_handoff.ts';
import { extractLeadFromConversationText } from './wpm_leads.ts';

Deno.test('stripHandoffSignal removes the tag and reports the request', () => {
  const result = stripHandoffSignal('Someone will call you shortly. [[HANDOFF]]');
  assertEquals(result.requested, true);
  assertEquals(result.content, 'Someone will call you shortly.');
});

Deno.test('stripHandoffSignal tolerates casing and stray spacing', () => {
  for (const tag of ['[[handoff]]', '[[ HANDOFF ]]', '[[Handoff]]']) {
    const result = stripHandoffSignal(`Help is coming. ${tag}`);
    assertEquals(result.requested, true, `failed for ${tag}`);
    assertEquals(result.content, 'Help is coming.', `failed for ${tag}`);
  }
});

Deno.test('stripHandoffSignal removes a mid-message tag without leaving double spaces', () => {
  const result = stripHandoffSignal('One moment [[HANDOFF]] please.');
  assertEquals(result.requested, true);
  assertEquals(result.content, 'One moment please.');
});

Deno.test('stripHandoffSignal leaves ordinary replies untouched', () => {
  const result = stripHandoffSignal('We open at 9am.');
  assertEquals(result.requested, false);
  assertEquals(result.content, 'We open at 9am.');
});

Deno.test('matchEmergencyKeyword matches whole words only', () => {
  assertEquals(matchEmergencyKeyword('I want a refund', ['refund']), 'refund');
  assertEquals(matchEmergencyKeyword('Is this refundable?', ['refund']), null);
  assertEquals(matchEmergencyKeyword('REFUND NOW', ['refund']), 'refund');
});

Deno.test('matchEmergencyKeyword handles punctuation and phrases', () => {
  assertEquals(matchEmergencyKeyword('I want a refund!', ['refund']), 'refund');
  assertEquals(matchEmergencyKeyword('taking legal action here', ['legal action']), 'legal action');
});

Deno.test('matchEmergencyKeyword matches accented words on their own boundaries', () => {
  assertEquals(matchEmergencyKeyword('quiero un reembolso', ['reembolso']), 'reembolso');
  assertEquals(matchEmergencyKeyword('reembolsos varios', ['reembolso']), null);
});

Deno.test('matchEmergencyKeyword is safe with regex characters in keywords', () => {
  assertEquals(matchEmergencyKeyword('what about c++ support', ['c++']), 'c++');
  assertEquals(matchEmergencyKeyword('nothing here', ['a.b']), null);
});

Deno.test('matchEmergencyKeyword returns null for empty inputs', () => {
  assertEquals(matchEmergencyKeyword('', ['refund']), null);
  assertEquals(matchEmergencyKeyword('refund', []), null);
  assertEquals(matchEmergencyKeyword(null, ['refund']), null);
  assertEquals(matchEmergencyKeyword('refund', null), null);
});

// ── Lead name extraction ─────────────────────────────────────────────────────

function nameFrom(inbound: string): string | null {
  return extractLeadFromConversationText({
    inboundText: inbound,
    assistantText: '',
    sourceChannel: 'instagram',
  }).fullName;
}

Deno.test('lead name: bare answer to "share your name and email" (the live failure)', () => {
  assertEquals(
    nameFrom('Wilfredo Carrasquillo disqueravirtual@gmail.com 9am everyday'),
    'Wilfredo Carrasquillo',
  );
});

Deno.test('lead name: still handles introductions', () => {
  assertEquals(nameFrom('Hi, my name is Maria Gonzalez'), 'Maria Gonzalez');
  assertEquals(nameFrom("i'm juan carlos perez"), 'Juan Carlos Perez');
});

Deno.test('lead name: email first, then name', () => {
  assertEquals(nameFrom('test@example.com Ana Rivera'), 'Ana Rivera');
});

Deno.test('lead name: does not invent names from greetings or products', () => {
  assertEquals(nameFrom('Hi there, can I talk to a human?'), null);
  assertEquals(nameFrom('Thanks! Best time is 9am everyday'), null);
  assertEquals(nameFrom('hello'), null);
});

Deno.test('lead name: ignores single capitalised words', () => {
  assertEquals(nameFrom('Wilfredo'), null);
});
