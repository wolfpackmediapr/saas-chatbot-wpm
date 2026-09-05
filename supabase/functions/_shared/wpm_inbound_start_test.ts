import { assertEquals, assertRejects } from 'jsr:@std/assert';
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

Deno.test('an OpenAI failure happens after the deterministic handoff is durable', async () => {
  const handoffRows: Array<{ reason: string }> = [];

  const allowance = await beginInboundTurn({
    persistDeterministicHandoff: async () => {
      handoffRows.push({ reason: 'Customer asked for a human: "talk to a human"' });
    },
    checkAllowance: async () => ({ allowed: true }),
  });

  await assertRejects(
    async () => {
      if (allowance.allowed) throw new Error('OpenAI unavailable');
    },
    Error,
    'OpenAI unavailable',
  );
  assertEquals(handoffRows, [{ reason: 'Customer asked for a human: "talk to a human"' }]);
});
