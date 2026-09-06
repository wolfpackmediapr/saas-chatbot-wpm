import { assertEquals } from 'jsr:@std/assert';
import { beginInboundTurn } from './wpm_inbound_start.ts';

Deno.test('usage exhaustion cannot discard a deterministic handoff', async () => {
  const handoffRows: Array<{ reason: string }> = [];

  const allowance = await beginInboundTurn({
    persistDeterministicHandoff: async () => {
      handoffRows.push({ reason: 'Emergency keyword: "lawsuit"' });
    },
    checkAllowance: async () => ({ allowed: false, reason: 'usage_cap' as const }),
  });

  assertEquals(allowance.allowed, false);
  assertEquals(handoffRows, [{ reason: 'Emergency keyword: "lawsuit"' }]);
});

// The OpenAI-failure case is covered in wpm_escalation_durability_test.ts,
// against the real generateAndStoreAssistantReply with an injected client that
// rejects. It previously lived here as a test that threw its own exception and
// asserted that exception was thrown — which could not fail for any change to
// production code. See the handbook: a test that passes before your change is a
// guard at best, and this one was not even that.
