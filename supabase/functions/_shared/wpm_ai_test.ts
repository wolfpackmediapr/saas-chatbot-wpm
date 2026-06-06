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
