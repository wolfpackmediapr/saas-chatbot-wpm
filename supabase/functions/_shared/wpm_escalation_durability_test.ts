/**
 * Does a deterministic escalation actually SURVIVE a failed turn?
 *
 * This is the property the 2026-09-05 reordering exists to create, and it was
 * previously asserted by a test that threw its own exception — so it could not
 * fail for any change to production code. These tests instead drive the real
 * `openHandoff` and the real `generateAndStoreAssistantReply`, and make the
 * failure come from an injected OpenAI client, which is how the live path
 * actually breaks.
 *
 * The bug being guarded: before the reorder, escalation ran inside
 * `if (aiResult.handoffRequested)` AFTER generation, so a `lawsuit` keyword
 * silently failed to escalate whenever the trial was spent, the API key was
 * missing, or OpenAI threw.
 *
 * ⚠️ CLASSIFICATION, stated honestly: these two are **guards, not regression
 * tests.** They call `openHandoff` and `generateAndStoreAssistantReply` in
 * sequence themselves, so they pass against `main` as well — they pin the
 * property (a persisted handoff survives a real provider rejection) rather
 * than the defect. The test that genuinely fails against the old ordering is
 * `meta-direct-webhook/escalation_call_site_test.ts`, which asserts the
 * handler calls them in that order. Both kinds are worth keeping; conflating
 * them is how a fix comes to look better tested than it is.
 */
import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { openHandoff } from './wpm_handoff.ts';
import { generateAndStoreAssistantReply, type OpenAIChatClient } from './wpm_ai.ts';

const CONVERSATION = 'conversation-uuid';
const CLIENT = 'client-uuid';

/**
 * Enough of supabase-js for both the handoff writer and the context loader.
 * Records every write so a test can assert what survived.
 */
function stubDatabase() {
  const inserts: Array<{ table: string; payload: unknown }> = [];
  const updates: Array<{ table: string; payload: unknown }> = [];

  const conversationRow = {
    id: CONVERSATION,
    client_id: CLIENT,
    bot_profile_id: 'bot-profile-uuid',
    wpm_clients: { id: CLIENT, name: 'Demo Restaurant', industry: 'restaurant' },
    wpm_bot_profiles: {
      id: 'bot-profile-uuid',
      public_name: 'Demo Concierge',
      model_provider: 'openai',
      model_name: 'gpt-4.1-mini',
    },
  };

  const instructionsRow = {
    system_prompt: 'Never invent availability.',
    business_summary: 'Private dining and catering.',
    emergency_keywords: ['lawsuit'],
    lead_fields: [],
  };

  function query(table: string) {
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      or: () => q,
      order: () => q,
      limit: () => q,
      insert(payload: unknown) {
        inserts.push({ table, payload });
        return q;
      },
      update(payload: unknown) {
        updates.push({ table, payload });
        return q;
      },
      maybeSingle() {
        if (table === 'wpm_conversations') return Promise.resolve({ data: conversationRow, error: null });
        if (table === 'wpm_bot_instructions') return Promise.resolve({ data: instructionsRow, error: null });
        // No handoff is already open, so openHandoff proceeds.
        return Promise.resolve({ data: null, error: null });
      },
      single() {
        return Promise.resolve({ data: { id: 'outbound-message-uuid' }, error: null });
      },
      then(resolve: (value: unknown) => void) {
        if (table === 'wpm_messages') {
          return Promise.resolve({
            data: [{ role: 'user', content: 'I want to talk to a human', created_at: '2026-09-05T12:00:00Z' }],
            error: null,
          }).then(resolve);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve);
      },
    };
    return q;
  }

  return {
    inserts,
    updates,
    from: (table: string) => query(table),
    handoffRows: () => inserts.filter((row) => row.table === 'wpm_handoff_events'),
  };
}

/** The way the live path actually fails: the provider call raises. */
const throwingOpenAI: OpenAIChatClient = {
  createChatCompletion() {
    return Promise.reject(new Error('OpenAI unavailable'));
  },
};

Deno.test('an OpenAI failure cannot erase a handoff persisted earlier in the same turn', async () => {
  const db = stubDatabase();

  // 1. The webhook persists the deterministic escalation first — this is what
  //    beginInboundTurn guarantees, before any allowance check or AI work.
  const { opened } = await openHandoff(db, {
    clientId: CLIENT,
    conversationId: CONVERSATION,
    reason: 'Customer asked for a human: "talk to a human"',
    source: 'auto',
  });
  assertEquals(opened, true);
  assertEquals(db.handoffRows().length, 1);

  // 2. The AI turn then fails for real — no fabricated throw, the injected
  //    client rejects and the production function propagates it.
  await assertRejects(
    () =>
      generateAndStoreAssistantReply({
        supabase: db,
        openAI: throwingOpenAI,
        conversationId: CONVERSATION,
        inboundMessage: 'I want to talk to a human',
      }),
    Error,
    'OpenAI unavailable',
  );

  // 3. The escalation is still on the record. A human is notified even though
  //    the customer never got a reply — which is the entire point.
  assertEquals(db.handoffRows().length, 1);
  assertEquals(
    (db.handoffRows()[0].payload as { reason: string }).reason,
    'Customer asked for a human: "talk to a human"',
  );
  // And no assistant message was stored, because generation never succeeded.
  assertEquals(db.inserts.filter((row) => row.table === 'wpm_messages').length, 0);
});

Deno.test('the conversation is marked handoff before the AI is ever called', async () => {
  const db = stubDatabase();

  await openHandoff(db, {
    clientId: CLIENT,
    conversationId: CONVERSATION,
    reason: 'Emergency keyword: "lawsuit"',
    source: 'auto',
  });

  const statusWrite = db.updates.find((row) => row.table === 'wpm_conversations');
  assertEquals((statusWrite?.payload as { status: string }).status, 'handoff');
  // 'auto' keeps the bot answering while the handoff is unattended, so this
  // ordering costs the customer nothing when generation DOES succeed.
  assertEquals(
    ((statusWrite?.payload as { metadata: Record<string, unknown> }).metadata).handoff_source,
    'auto',
  );
});
