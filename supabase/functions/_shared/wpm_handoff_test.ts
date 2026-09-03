import { assertEquals, assertNotEquals } from 'jsr:@std/assert';
import { matchEmergencyKeyword, matchEscalationRequest, stripHandoffSignal } from './wpm_handoff.ts';
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

// ── Built-in escalation on an explicit request for a human ──────────────────
// These are the exact live messages that FAILED to escalate on 2026-09-02 with
// an emergency_keywords list of ["lawsuit","data breach","refund"]. Every one
// of them returns null from matchEmergencyKeyword — which is the whole bug.

Deno.test('an explicit request for a human escalates with NO keywords configured', () => {
  const ownerKeywords = ['lawsuit', 'data breach', 'refund'];
  const realMisses = [
    'I want to talk to a human again.',
    'Can I talk to a human?',
    'Oye quisiera hablar ahora mismo con un humano',
  ];
  for (const text of realMisses) {
    // The owner's keyword list cannot catch these — this is the gap.
    assertEquals(matchEmergencyKeyword(text, ownerKeywords), null, text);
    // The built-in must.
    assertNotEquals(matchEscalationRequest(text), null, text);
  }
});

Deno.test('matchEscalationRequest covers the common phrasings, English and Spanish', () => {
  for (const text of [
    'can I speak with a representative',
    'please connect me to someone',
    'I need a real person',
    'transfer me to an agent',
    'give me a live agent',
    'quiero hablar con una persona',
    'me pueden comunicar con un agente',
    'necesito un representante',
    'quisiera hablar con alguien',
  ]) {
    assertNotEquals(matchEscalationRequest(text), null, text);
  }
});

Deno.test('matchEscalationRequest ignores accents', () => {
  assertNotEquals(matchEscalationRequest('quiero hablar con un agénte'), null);
});

Deno.test('matchEscalationRequest does NOT fire on asking whether the bot is human', () => {
  // Hard rule 8 has the agent answer these truthfully. Escalating them would
  // page a teammate for an ordinary question — which is why these patterns
  // match a REQUEST (verb aimed at a person-noun), not the bare word "human".
  for (const text of [
    'are you a human?',
    'are you human or a bot',
    'you sound human',
    'is this a real person or AI?',
    'eres un humano?',
    'that was a very human answer',
  ]) {
    assertEquals(matchEscalationRequest(text), null, text);
  }
});

Deno.test('matchEscalationRequest ignores our own lead-capture boilerplate', () => {
  // The agent writes this in nearly every lead-capture reply. It must never be
  // fed back in as an escalation — the 2026-08-30 intent bug, one level over.
  assertEquals(
    matchEscalationRequest('A team member will follow up with you shortly.'),
    null,
  );
  assertEquals(
    matchEscalationRequest('Un miembro del equipo se pondrá en contacto contigo.'),
    null,
  );
});
