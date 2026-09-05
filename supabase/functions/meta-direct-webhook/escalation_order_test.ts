import { assert } from 'jsr:@std/assert';
// Architecture guard: the external-service failure paths must not precede
// deterministic escalation. Behavior of matching and persistence is tested
// separately without invoking a live webhook or sending notifications.
Deno.test('explicit handoff is persisted before usage, missing-key and AI failure paths', async () => {
  const source = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  const escalation = source.indexOf('await escalate(\n          emergencyHit');
  assert(escalation >= 0);
  for (const boundary of ['const allowance = await checkConversationAllowance', "const openaiKey = Deno.env.get('OPENAI_API_KEY')", 'const aiResult = await generateAndStoreAssistantReply']) {
    assert(escalation < source.indexOf(boundary), `Escalation must precede ${boundary}`);
  }
});
