import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  executeWebhookToolExecution,
  resolveWebhookUrl,
  type ToolExecutionRow,
} from './wpm_actions.ts';

class QueryStub {
  private table: string;
  private db: Record<string, unknown>;
  private updatePayload: unknown = null;

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

  update(payload: unknown) {
    this.updatePayload = payload;
    (this.db.updates as Array<{ table: string; payload: unknown }>).push({ table: this.table, payload });
    return this;
  }

  maybeSingle() {
    return Promise.resolve({ data: this.db[`${this.table}:single`] ?? null, error: null });
  }

  single() {
    return Promise.resolve({ data: this.updatePayload ?? this.db[`${this.table}:single`] ?? null, error: null });
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

const toolExecution: ToolExecutionRow = {
  id: 'tool-execution-uuid',
  client_id: 'client-uuid',
  conversation_id: 'conversation-uuid',
  integration_id: 'integration-uuid',
  tool_name: 'zapier.qualified_lead',
  input_payload: {
    lead_id: 'lead-uuid',
    lead: {
      fullName: 'Jane Rivera',
      phone: '+178****0123',
      serviceInterest: 'private dining',
    },
  },
  wpm_integrations: {
    id: 'integration-uuid',
    provider: 'zapier',
    integration_type: 'zapier_webhook',
    name: 'Qualified Lead Zap',
    secret_reference: 'WPM_ZAPIER_QUALIFIED_LEAD_URL',
    metadata: { trigger: 'qualified_lead' },
  },
};

Deno.test('resolveWebhookUrl resolves integration webhook URL from server-side env secret reference', () => {
  assertEquals(resolveWebhookUrl(toolExecution.wpm_integrations, (name: string) => {
    if (name === 'WPM_ZAPIER_QUALIFIED_LEAD_URL') return 'https://hooks.zapier.com/hooks/catch/demo';
    return undefined;
  }), {
    ok: true,
    url: 'https://hooks.zapier.com/hooks/catch/demo',
  });
});

Deno.test('resolveWebhookUrl rejects missing webhook URL secret without exposing secret values', () => {
  assertEquals(resolveWebhookUrl(toolExecution.wpm_integrations, () => undefined), {
    ok: false,
    error: 'Missing webhook URL secret: WPM_ZAPIER_QUALIFIED_LEAD_URL',
  });
});

Deno.test('executeWebhookToolExecution posts input payload and marks execution success', async () => {
  const supabase = new SupabaseStub({
    updates: [],
    'wpm_tool_executions:single': toolExecution,
  });
  const fetchCalls: Array<{ url: string; init: RequestInit }> = [];

  const result = await executeWebhookToolExecution({
    supabase,
    toolExecutionId: 'tool-execution-uuid',
    getEnv: (name: string) => name === 'WPM_ZAPIER_QUALIFIED_LEAD_URL' ? 'https://hooks.zapier.com/hooks/catch/demo' : undefined,
    fetcher: async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    now: () => 1000,
  });

  assertEquals(result, {
    ok: true,
    status: 'success',
    httpStatus: 200,
    error: null,
  });
  assertEquals(fetchCalls[0].url, 'https://hooks.zapier.com/hooks/catch/demo');
  assertEquals(JSON.parse(String(fetchCalls[0].init.body)).lead_id, 'lead-uuid');
  assertEquals((supabase.db.updates as Array<{ table: string; payload: Record<string, unknown> }>).at(-1), {
    table: 'wpm_tool_executions',
    payload: {
      status: 'success',
      output_payload: { http_status: 200, response_body: { ok: true } },
      error_message: null,
      latency_ms: 0,
    },
  });
});

Deno.test('executeWebhookToolExecution marks execution failed when webhook returns non-2xx', async () => {
  const supabase = new SupabaseStub({
    updates: [],
    'wpm_tool_executions:single': toolExecution,
  });

  const result = await executeWebhookToolExecution({
    supabase,
    toolExecutionId: 'tool-execution-uuid',
    getEnv: () => 'https://hooks.zapier.com/hooks/catch/demo',
    fetcher: async () => new Response('bad request', { status: 400 }),
    now: () => 1000,
  });

  assertEquals(result, {
    ok: false,
    status: 'failed',
    httpStatus: 400,
    error: 'Webhook request failed with HTTP 400',
  });
  assertEquals((supabase.db.updates as Array<{ payload: Record<string, unknown> }>).at(-1)?.payload.status, 'failed');
});
