/**
 * A structural guard on where a like leaves the handler.
 *
 * A like must be STORED (so the Inbox and the agent's context show it) and
 * must NOT be answered, charged against an allowance, escalated or mined for a
 * lead. Unit tests pin the detection; only the source can show the exit sits
 * after the inbound insert and before everything else. Same deliberately
 * labelled shape as escalation_call_site_test.ts — if the handler is
 * refactored so this moves, update it on purpose.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const source = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('a like is stored first and leaves before handoff, allowance and the AI', () => {
  const stored = source.indexOf('// ── Store inbound message');
  const exit = source.indexOf('if (event.acknowledgementOnly) {');
  assert(stored > -1 && exit > -1, 'the inbound store or the like exit is gone from the handler');
  assert(stored < exit, 'the like must be stored before the handler stops');

  for (const later of [
    '// ── Skip AI if a human has taken over',
    'resolveDeterministicHandoff(',
    'beginInboundTurn(',
    'generateAndStoreAssistantReply(',
    'extractLeadFromConversationText(',
  ]) {
    const at = source.indexOf(later);
    assert(at > -1, `${later} is gone from the handler`);
    assert(exit < at, `the like must leave before ${later}`);
  }

  const branch = source.slice(exit, source.indexOf('continue;', exit));
  assertEquals(branch.includes('sendGraphApiReply'), false, 'a like must never be answered');
});
