/**
 * A structural guard on the ONE thing the unit tests cannot reach.
 *
 * `wpm_inbound_start_test.ts` pins the ordering *inside* `beginInboundTurn`,
 * and `wpm_escalation_durability_test.ts` pins that a persisted handoff
 * survives a real OpenAI rejection. Neither can detect the regression that
 * actually matters here: someone moving the escalation back below the AI call
 * in this file. `beginInboundTurn` would simply stop being on the path, and
 * every behaviour test would still pass while the original bug returned.
 *
 * That bug is not hypothetical — it is what this branch fixes. Escalation used
 * to live inside `if (aiResult.handoffRequested)` after generation, so a
 * `lawsuit` keyword silently failed to escalate whenever the trial was spent,
 * the API key was missing, or OpenAI threw.
 *
 * This is deliberately a source-order assertion. It is the cheapest honest
 * guard available, and it is labelled as structural rather than dressed up as
 * behaviour. If the handler is ever refactored so the seam moves, update this
 * test on purpose — do not delete it because it went red.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const source = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('the deterministic handoff is persisted before the AI is called', () => {
  const persistedAt = source.indexOf('persistDeterministicHandoff');
  const generatedAt = source.indexOf('await generateAndStoreAssistantReply');

  assertEquals(persistedAt > -1, true, 'beginInboundTurn seam is gone from the handler');
  assertEquals(generatedAt > -1, true, 'generateAndStoreAssistantReply call not found');
  assertEquals(
    persistedAt < generatedAt,
    true,
    'Escalation must persist BEFORE generation. Moving it after re-introduces the bug where an exhausted allowance or an OpenAI failure silently discards a deterministic escalation.',
  );
});

Deno.test('escalation runs after the manual-takeover exit, so a human keeps the thread', () => {
  const handoffSkip = source.indexOf('is in handoff mode — AI response skipped');
  const persistedAt = source.indexOf('persistDeterministicHandoff');

  assertEquals(handoffSkip > -1, true, 'manual-takeover early exit not found');
  assertEquals(
    handoffSkip < persistedAt,
    true,
    'A conversation already owned by a human must short-circuit before re-escalating.',
  );
});
