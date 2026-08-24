import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildOutboundAssistantMessageInsertPayload,
  generateAndStoreAssistantReply,
  loadWpmBotContext,
  type OpenAIChatClient,
} from './wpm_ai.ts';

function ok(data: unknown) {
  return { data, error: null };
}

class QueryStub {
  private table: string;
  private db: Record<string, unknown>;

  constructor(table: string, db: Record<string, unknown>) {
    this.table = table;
    this.db = db;
  }

  select(_columns?: string) {
    return this;
  }

  eq(_column: string, _value: unknown) {
    return this;
  }

  order(_column: string, _options?: unknown) {
    return this;
  }

  limit(_count: number) {
    return this;
  }

  insert(payload: unknown) {
    (this.db.inserts as Array<{ table: string; payload: unknown }>).push({ table: this.table, payload });
    return this;
  }

  maybeSingle() {
    return Promise.resolve(ok(this.db[`${this.table}:single`] ?? null));
  }

  single() {
    const inserted = (this.db.inserts as Array<{ table: string; payload: unknown }>).at(-1);
    if (this.table === 'wpm_messages' && inserted?.table === 'wpm_messages') {
      return Promise.resolve(ok({ id: 'outbound-message-uuid', ...(inserted.payload as Record<string, unknown>) }));
    }
    return Promise.resolve(ok(this.db[`${this.table}:single`]));
  }

  then(resolve: (value: unknown) => void) {
    if (this.table === 'wpm_knowledge_sources') {
      return Promise.resolve(ok(this.db['wpm_knowledge_sources:list'] ?? [])).then(resolve);
    }
    if (this.table === 'wpm_messages') {
      return Promise.resolve(ok(this.db['wpm_messages:list'] ?? [])).then(resolve);
    }
    return Promise.resolve(ok([])).then(resolve);
  }
}

class SupabaseStub {
  db: Record<string, unknown>;

  constructor(db: Record<string, unknown>) {
    this.db = db;
  }

  from(table: string) {
    return new QueryStub(table, this.db);
  }
}

Deno.test('loadWpmBotContext loads client, bot profile, active instructions, ready knowledge, and recent messages', async () => {
  const supabase = new SupabaseStub({
    inserts: [],
    'wpm_conversations:single': {
      id: 'conversation-uuid',
      client_id: 'client-uuid',
      bot_profile_id: 'bot-profile-uuid',
      wpm_clients: {
        id: 'client-uuid',
        name: 'Demo Restaurant',
        industry: 'restaurant',
        timezone: 'America/Puerto_Rico',
        website_url: 'https://example.com',
      },
      wpm_bot_profiles: {
        id: 'bot-profile-uuid',
        public_name: 'Demo Concierge',
        tone: 'premium',
        language: 'en',
        response_length: 'concise',
        booking_url: 'https://example.com/book',
        handoff_contact: 'team@example.com',
        model_provider: 'openai',
        model_name: 'gpt-4.1-mini',
      },
    },
    'wpm_bot_instructions:single': {
      system_prompt: 'Never invent availability.',
      business_summary: 'Private dining and catering.',
      faq_instructions: 'Open Tue-Sun.',
      lead_qualification_instructions: 'Collect name and date.',
      handoff_rules: 'Escalate complaints.',
      never_say_rules: 'Never confirm reservations.',
      emergency_keywords: ['refund'],
      lead_fields: ['name', 'date'],
    },
    'wpm_knowledge_sources:list': [
      { title: 'Menu', content_text: 'Catering packages available.' },
    ],
    'wpm_messages:list': [
      { role: 'user', content: 'Do you cater?', created_at: '2026-06-05T12:00:00Z' },
    ],
  });

  const loaded = await loadWpmBotContext(supabase, 'conversation-uuid');

  assertEquals(loaded.ok, true);
  if (!loaded.ok) throw new Error(loaded.error);
  assertEquals(loaded.context.client.name, 'Demo Restaurant');
  assertEquals(loaded.context.botProfile.model_name, 'gpt-4.1-mini');
  assertEquals(loaded.context.knowledge[0].title, 'Menu');
  assertEquals(loaded.recentMessages, [{ role: 'user', content: 'Do you cater?' }]);
});

Deno.test('buildOutboundAssistantMessageInsertPayload stores server-side model metadata and token usage', () => {
  assertEquals(buildOutboundAssistantMessageInsertPayload({
    conversationId: 'conversation-uuid',
    clientId: 'client-uuid',
    content: 'Yes — we can help with catering. What date do you need?',
    modelProvider: 'openai',
    modelName: 'gpt-4.1-mini',
    tokenUsage: { input_tokens: 10, output_tokens: 12 },
    rawResponse: { id: 'chatcmpl-demo' },
  }), {
    conversation_id: 'conversation-uuid',
    client_id: 'client-uuid',
    direction: 'outbound',
    role: 'assistant',
    content: 'Yes — we can help with catering. What date do you need?',
    attachments: [],
    model_provider: 'openai',
    model_name: 'gpt-4.1-mini',
    token_usage: { input_tokens: 10, output_tokens: 12 },
    metadata: {
      provider_response_id: 'chatcmpl-demo',
      generated_by: 'wpm_ai',
    },
  });
});

Deno.test('generateAndStoreAssistantReply calls OpenAI with assembled prompt and stores outbound assistant message', async () => {
  const supabase = new SupabaseStub({
    inserts: [],
    'wpm_conversations:single': {
      id: 'conversation-uuid',
      client_id: 'client-uuid',
      bot_profile_id: 'bot-profile-uuid',
      wpm_clients: {
        id: 'client-uuid',
        name: 'Demo Restaurant',
        industry: 'restaurant',
        timezone: 'America/Puerto_Rico',
        website_url: 'https://example.com',
      },
      wpm_bot_profiles: {
        id: 'bot-profile-uuid',
        public_name: 'Demo Concierge',
        tone: 'premium',
        language: 'en',
        response_length: 'concise',
        booking_url: 'https://example.com/book',
        handoff_contact: 'team@example.com',
        model_provider: 'openai',
        model_name: 'gpt-4.1-mini',
      },
    },
    'wpm_bot_instructions:single': {
      system_prompt: 'Never invent availability.',
      business_summary: 'Private dining and catering.',
      faq_instructions: 'Open Tue-Sun.',
      lead_qualification_instructions: 'Collect name and date.',
      handoff_rules: 'Escalate complaints.',
      never_say_rules: 'Never confirm reservations.',
      emergency_keywords: [],
      lead_fields: ['name', 'date'],
    },
    'wpm_knowledge_sources:list': [],
    'wpm_messages:list': [
      { role: 'user', content: 'Do you cater?', created_at: '2026-06-05T12:00:00Z' },
    ],
  });

  const calls: unknown[] = [];
  const openAI: OpenAIChatClient = {
    async createChatCompletion(request: Parameters<OpenAIChatClient['createChatCompletion']>[0]) {
      calls.push(request);
      return {
        id: 'chatcmpl-demo',
        content: 'Yes — we can help with catering. What date do you need?',
        tokenUsage: { input_tokens: 100, output_tokens: 20 },
        raw: { id: 'chatcmpl-demo' },
      };
    },
  };

  const result = await generateAndStoreAssistantReply({
    supabase,
    openAI,
    conversationId: 'conversation-uuid',
    inboundMessage: 'I need catering for Friday.',
  });

  assertEquals(result.ok, true);
  if (!result.ok) throw new Error(result.error);
  assertEquals(result.content, 'Yes — we can help with catering. What date do you need?');
  assertEquals(result.messageId, 'outbound-message-uuid');
  assertEquals((calls[0] as { model: string }).model, 'gpt-4.1-mini');
  assertStringIncludes(JSON.stringify(calls[0]), 'Never invent availability.');
  assertEquals((supabase.db.inserts as Array<{ table: string }>).at(-1)?.table, 'wpm_messages');
});

// ─── Conversation context: human replies and the duplicated inbound turn ─────
// Both defects below were found in production on 2026-08-23 and are guarded
// here because neither produced an error — the agent simply answered as if it
// had never seen what a colleague wrote, and read the newest message twice.

function contextStubDb(messages: unknown[]) {
  return {
    inserts: [],
    'wpm_conversations:single': {
      id: 'conversation-uuid',
      client_id: 'client-uuid',
      bot_profile_id: 'bot-profile-uuid',
      wpm_clients: { id: 'client-uuid', name: 'Demo Restaurant' },
      wpm_bot_profiles: {
        id: 'bot-profile-uuid',
        public_name: 'Demo Concierge',
        tone: 'premium',
        language: 'en',
        response_length: 'concise',
        model_provider: 'openai',
        model_name: 'gpt-4.1-mini',
      },
    },
    'wpm_bot_instructions:single': null,
    'wpm_knowledge_sources:list': [],
    // The real query is `order('created_at', desc)`, so the stub holds rows
    // newest-first exactly as Postgres would return them.
    'wpm_messages:list': messages,
  };
}

async function loadMessages(rows: unknown[], excludeProviderMessageId?: string | null) {
  const loaded = await loadWpmBotContext(
    new SupabaseStub(contextStubDb(rows)),
    'conversation-uuid',
    excludeProviderMessageId === undefined ? undefined : { excludeProviderMessageId },
  );
  if (!loaded.ok) throw new Error(loaded.error);
  return loaded.recentMessages;
}

Deno.test('a human Inbox reply reaches the model, labelled so it is not mistaken for the bot', async () => {
  const messages = await loadMessages([
    { role: 'user', content: 'for you to call me', created_at: '2026-08-23T12:02:00Z' },
    { role: 'human', content: 'Sure — what number is best?', created_at: '2026-08-23T12:01:00Z' },
    { role: 'user', content: 'can I talk to a human', created_at: '2026-08-23T12:00:00Z' },
  ]);

  assertEquals(messages, [
    { role: 'user', content: 'can I talk to a human' },
    { role: 'assistant', content: '[Replied by a human teammate] Sure — what number is best?' },
    { role: 'user', content: 'for you to call me' },
  ]);
});

Deno.test('human turns no longer shrink the window — the model still gets 12 turns', async () => {
  // Chronological, oldest first: two non-conversational rows, twelve real
  // turns, a colleague's Inbox reply, then the customer answering them.
  // Under the old code — fetch 12 rows, filter afterwards — the human reply and
  // the system/tool rows each cost the model a turn of real history. It saw 11.
  const chronological = [
    { role: 'system', content: 'internal note', created_at: '2026-08-23T09:58:00Z' },
    { role: 'tool', content: 'tool output', created_at: '2026-08-23T09:59:00Z' },
    ...Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `turn ${i}`,
      created_at: `2026-08-23T10:${String(i).padStart(2, '0')}:00Z`,
    })),
    { role: 'human', content: 'a colleague answered', created_at: '2026-08-23T10:20:00Z' },
    { role: 'user', content: 'thanks, my number is…', created_at: '2026-08-23T10:21:00Z' },
  ];

  const messages = await loadMessages(chronological.slice().reverse()); // newest first, as the database returns them

  assertEquals(messages.length, 12);
  assertEquals(messages.some((m) => m.content.includes('internal note')), false);
  assertEquals(messages.some((m) => m.content.includes('tool output')), false);
  // The window is full of real turns, and the colleague is still in it.
  assertEquals(messages[0].content, 'turn 2');
  assertEquals(messages[10], {
    role: 'assistant',
    content: '[Replied by a human teammate] a colleague answered',
  });
  assertEquals(messages[11], { role: 'user', content: 'thanks, my number is…' });
});

Deno.test('the message being replied to is not sent twice', async () => {
  const rows = [
    { role: 'user', content: 'hola', created_at: '2026-08-23T12:01:00Z', provider_message_id: 'mid-2' },
    { role: 'assistant', content: 'Hi!', created_at: '2026-08-23T12:00:00Z', provider_message_id: null },
  ];

  assertEquals(await loadMessages(rows, 'mid-2'), [{ role: 'assistant', content: 'Hi!' }]);
  // Without the id the previous behaviour is unchanged — nothing is removed.
  assertEquals((await loadMessages(rows)).length, 2);
});

Deno.test('a customer who really repeats themselves keeps both turns', async () => {
  // Matching on text would have deleted a genuine turn here. Only the row whose
  // provider_message_id is the one being answered may go.
  const messages = await loadMessages([
    { role: 'user', content: 'hola', created_at: '2026-08-23T12:01:00Z', provider_message_id: 'mid-2' },
    { role: 'user', content: 'hola', created_at: '2026-08-23T12:00:00Z', provider_message_id: 'mid-1' },
  ], 'mid-2');

  assertEquals(messages, [{ role: 'user', content: 'hola' }]);
});

Deno.test('only the newest row is eligible for removal', async () => {
  // A late-arriving webhook must never strip a message from the middle of the
  // history: if the id does not belong to the newest row, nothing is dropped.
  const messages = await loadMessages([
    { role: 'assistant', content: 'Hi!', created_at: '2026-08-23T12:02:00Z', provider_message_id: null },
    { role: 'user', content: 'hola', created_at: '2026-08-23T12:01:00Z', provider_message_id: 'mid-1' },
  ], 'mid-1');

  assertEquals(messages.length, 2);
});
