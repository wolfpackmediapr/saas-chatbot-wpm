/**
 * A structural guard on the blocked-reply branch of the handler.
 *
 * Until 2026-09-15 this branch sent the customer a canned "they'll get back to
 * you shortly" that alerted nobody, and it went to real customers of an expired
 * trial. The decision since then is: a blocked reply sends the customer
 * NOTHING and tells the owner instead (`_shared/wpm_blocked_alerts.ts`).
 *
 * The unit tests cover the alert module. Nothing there can see someone adding a
 * Graph send back into this branch, so this reads the source — the same
 * deliberately-labelled structural shape as `escalation_call_site_test.ts`.
 * If the handler is refactored so the branch moves, update this on purpose.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const source = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

function blockedBranch(): string {
  const start = source.indexOf('if (!allowance.allowed) {');
  assert(start > -1, 'the blocked-reply branch is gone from the handler');
  const end = source.indexOf('continue;', start);
  assert(end > start, 'the blocked-reply branch no longer ends in continue');
  return source.slice(start, end);
}

Deno.test('a blocked reply sends the customer nothing', () => {
  const branch = blockedBranch();
  assertEquals(branch.includes('sendGraphApiReply'), false, 'a blocked reply must not message the customer');
  assertEquals(branch.includes("from('wpm_messages')"), false, 'a blocked reply must not store an outbound message');
});

Deno.test('a blocked reply tells the owner', () => {
  assertEquals(blockedBranch().includes('alertOwnerOfBlockedMessage'), true);
});

Deno.test('the customer-facing notices are gone for good', () => {
  assertEquals(source.includes('usage_cap_notice'), false);
  assertEquals(source.includes('conversation_cap_notice'), false);
  assertEquals(source.includes('noticeForBlock'), false);
});
