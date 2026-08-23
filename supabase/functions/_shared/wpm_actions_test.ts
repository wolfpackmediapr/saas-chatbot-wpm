import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  CONFIG_RETRY_SECONDS,
  executeEmailToolExecution,
  executeWebhookToolExecution,
  MAX_DELIVERY_ATTEMPTS,
  processPendingWebhookToolExecutions,
  resolveWebhookUrl,
  type ToolExecutionRow,
} from './wpm_actions.ts';

class QueryStub {
  private table: string;
  private db: Record<string, unknown>;
  private updatePayload: unknown = null;
  private filters: Record<string, unknown> = {};

  constructor(table: string, db: Record<string, unknown>) {
    this.table = table;
    this.db = db;
  }

  select(_columns?: string) {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  or(expression: string) {
    (this.db.orFilters as string[] | undefined)?.push(expression);
    return this;
  }

  order(_column: string, _options?: unknown) {
    return this;
  }

  limit(count: number) {
    const rows = (this.db[`${this.table}:list`] ?? []) as Array<Record<string, unknown>>;
    return Promise.resolve({ data: rows.slice(0, count), error: null });
  }

  update(payload: unknown) {
    this.updatePayload = payload;
    (this.db.updates as Array<{ table: string; payload: unknown }>).push({ table: this.table, payload });
    return this;
  }

  maybeSingle() {
    if (this.filters.id && this.db[`${this.table}:byId`]) {
      const byId = this.db[`${this.table}:byId`] as Record<string, unknown>;
      return Promise.resolve({ data: byId[String(this.filters.id)] ?? null, error: null });
    }
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
  status: 'pending',
  attempt_count: 0,
  wpm_integrations: {
    id: 'integration-uuid',
    provider: 'zapier',
    integration_type: 'zapier_webhook',
    name: 'Qualified Lead Zap',
    secret_reference: 'WPM_ZAPIER_QUALIFIED_LEAD_URL',
    metadata: { trigger: 'qualified_lead' },
  },
};

/** The self-serve shape: no secret, the customer's own hook stored on the row. */
const selfServeIntegration = {
  id: 'integration-self-serve',
  provider: 'zapier',
  integration_type: 'zapier_webhook',
  name: 'Qualified Lead Webhook',
  secret_reference: null,
  metadata: { webhook_url: 'https://hooks.zapier.com/hooks/catch/9999/abcdef' },
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
    error: 'No webhook URL: secret WPM_ZAPIER_QUALIFIED_LEAD_URL is unset and no webhook_url is configured on integration integration-uuid',
  });
});

Deno.test('resolveWebhookUrl reads the URL the Automations page saved on the row', () => {
  // The whole point of Model A: a customer pastes their own hook and it works,
  // with no Supabase secret and no deploy.
  assertEquals(resolveWebhookUrl(selfServeIntegration, () => undefined), {
    ok: true,
    url: 'https://hooks.zapier.com/hooks/catch/9999/abcdef',
  });
});

Deno.test('resolveWebhookUrl prefers the secret when both sources are present', () => {
  const both = { ...selfServeIntegration, secret_reference: 'WPM_ZAPIER_QUALIFIED_LEAD_URL' };
  assertEquals(resolveWebhookUrl(both, (name) =>
    name === 'WPM_ZAPIER_QUALIFIED_LEAD_URL' ? 'https://hooks.zapier.com/hooks/catch/from-secret' : undefined), {
    ok: true,
    url: 'https://hooks.zapier.com/hooks/catch/from-secret',
  });
});

Deno.test('resolveWebhookUrl falls back to the row when the named secret is unset', () => {
  // An integration wired to a secret that was never set must not shadow a URL
  // the customer did configure.
  const both = { ...selfServeIntegration, secret_reference: 'WPM_ZAPIER_QUALIFIED_LEAD_URL' };
  assertEquals(resolveWebhookUrl(both, () => undefined), {
    ok: true,
    url: 'https://hooks.zapier.com/hooks/catch/9999/abcdef',
  });
});

Deno.test('resolveWebhookUrl refuses a non-HTTPS webhook URL', () => {
  const insecure = { ...selfServeIntegration, metadata: { webhook_url: 'http://hooks.zapier.com/x' } };
  assertEquals(resolveWebhookUrl(insecure, () => undefined), {
    ok: false,
    error: 'Webhook URL for integration integration-self-serve must be an HTTPS URL',
  });
});

Deno.test('an empty webhook_url is treated as unconfigured, not as a URL', () => {
  // This is the exact live state: is_active true, metadata.webhook_url ''.
  const blank = { ...selfServeIntegration, metadata: { webhook_url: '   ' } };
  assertEquals(resolveWebhookUrl(blank, () => undefined), {
    ok: false,
    error: 'No webhook URL configured on integration integration-self-serve',
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
      attempt_count: 1,
      next_attempt_at: null,
    },
  });
});

Deno.test('a retryable failure keeps the lead queued instead of burning it', async () => {
  // The bug this replaces: any non-2xx marked the row `failed`, and the drain
  // only ever selected `pending`, so one bad minute at Zapier lost the lead.
  const supabase = new SupabaseStub({
    updates: [],
    'wpm_tool_executions:single': toolExecution,
  });

  const result = await executeWebhookToolExecution({
    supabase,
    toolExecutionId: 'tool-execution-uuid',
    getEnv: () => 'https://hooks.zapier.com/hooks/catch/demo',
    fetcher: async () => new Response('upstream is down', { status: 503 }),
    now: () => 1_000_000,
  });

  assertEquals(result.status, 'pending');
  const payload = (supabase.db.updates as Array<{ payload: Record<string, unknown> }>).at(-1)!.payload;
  assertEquals(payload.status, 'pending');
  assertEquals(payload.attempt_count, 1);
  // 60s backoff after the first attempt.
  assertEquals(payload.next_attempt_at, new Date(1_060_000).toISOString());
});

Deno.test('a 4xx is permanent and is never retried', async () => {
  // Retrying a 400 forever burns the queue and hides a configuration error the
  // customer needs to see.
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

  assertEquals(result.status, 'failed');
  const payload = (supabase.db.updates as Array<{ payload: Record<string, unknown> }>).at(-1)!.payload;
  assertEquals(payload.status, 'failed');
  assertEquals(payload.next_attempt_at, null);
});

Deno.test('the last allowed attempt parks the row as failed', async () => {
  const supabase = new SupabaseStub({
    updates: [],
    'wpm_tool_executions:single': { ...toolExecution, attempt_count: MAX_DELIVERY_ATTEMPTS - 1 },
  });

  const result = await executeWebhookToolExecution({
    supabase,
    toolExecutionId: 'tool-execution-uuid',
    getEnv: () => 'https://hooks.zapier.com/hooks/catch/demo',
    fetcher: async () => new Response('still down', { status: 503 }),
    now: () => 1000,
  });

  assertEquals(result.status, 'failed');
  assertEquals(
    (supabase.db.updates as Array<{ payload: Record<string, unknown> }>).at(-1)!.payload.attempt_count,
    MAX_DELIVERY_ATTEMPTS,
  );
});

Deno.test('a lead with nowhere to go yet is held, and does not consume an attempt', async () => {
  // Wilf connects the CRM after the first leads arrive. Marking those `failed`
  // would throw away real customers over an unfinished setup step.
  const supabase = new SupabaseStub({
    updates: [],
    'wpm_tool_executions:single': {
      ...toolExecution,
      wpm_integrations: { ...selfServeIntegration, metadata: { webhook_url: '' } },
    },
  });
  let fetchCalled = false;

  const result = await executeWebhookToolExecution({
    supabase,
    toolExecutionId: 'tool-execution-uuid',
    getEnv: () => undefined,
    fetcher: async () => {
      fetchCalled = true;
      return new Response('', { status: 200 });
    },
    now: () => 1_000_000,
  });

  assertEquals(result.status, 'pending');
  assertEquals(fetchCalled, false);
  const payload = (supabase.db.updates as Array<{ payload: Record<string, unknown> }>).at(-1)!.payload;
  assertEquals(payload.status, 'pending');
  assertEquals(payload.attempt_count, undefined); // no attempt consumed
  assertEquals(payload.next_attempt_at, new Date(1_000_000 + CONFIG_RETRY_SECONDS * 1000).toISOString());
});

Deno.test('every delivery carries an idempotency key so a retry cannot duplicate a CRM contact', async () => {
  const supabase = new SupabaseStub({
    updates: [],
    'wpm_tool_executions:single': toolExecution,
  });
  let headers: Record<string, string> = {};

  await executeWebhookToolExecution({
    supabase,
    toolExecutionId: 'tool-execution-uuid',
    getEnv: (name: string) =>
      name === 'WPM_WEBHOOK_SIGNING_SECRET' ? undefined : 'https://hooks.zapier.com/hooks/catch/demo',
    fetcher: async (_url: string | URL | Request, init?: RequestInit) => {
      headers = (init?.headers ?? {}) as Record<string, string>;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    now: () => 1000,
  });

  assertEquals(headers['X-WPM-Idempotency-Key'], 'tool-execution-uuid');
  assertEquals(headers['X-WPM-Signature'], undefined); // unsigned when no secret is set
});

Deno.test('the body is signed when a signing secret is configured', async () => {
  const supabase = new SupabaseStub({
    updates: [],
    'wpm_tool_executions:single': toolExecution,
  });
  let headers: Record<string, string> = {};

  await executeWebhookToolExecution({
    supabase,
    toolExecutionId: 'tool-execution-uuid',
    getEnv: (name: string) => {
      if (name === 'WPM_WEBHOOK_SIGNING_SECRET') return 'topsecret';
      return 'https://hooks.zapier.com/hooks/catch/demo';
    },
    fetcher: async (_url: string | URL | Request, init?: RequestInit) => {
      headers = (init?.headers ?? {}) as Record<string, string>;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    now: () => 1000,
  });

  assertEquals(headers['X-WPM-Signature']?.startsWith('sha256='), true);
  assertEquals(headers['X-WPM-Timestamp'], '1');
});

Deno.test('executeWebhookToolExecution skips non-pending execution without making webhook call', async () => {
  const supabase = new SupabaseStub({
    updates: [],
    'wpm_tool_executions:single': { ...toolExecution, status: 'success' },
  });
  let fetchCalled = false;

  const result = await executeWebhookToolExecution({
    supabase,
    toolExecutionId: 'tool-execution-uuid',
    getEnv: () => 'https://hooks.zapier.com/hooks/catch/demo',
    fetcher: async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  assertEquals(result, {
    ok: false,
    status: 'skipped',
    httpStatus: null,
    error: 'Tool execution is not pending (status: success)',
  });
  assertEquals(fetchCalled, false);
  assertEquals(supabase.db.updates, []);
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

Deno.test('processPendingWebhookToolExecutions runs a bounded batch of pending executions', async () => {
  const supabase = new SupabaseStub({
    updates: [],
    'wpm_tool_executions:list': [{ id: 'tool-1' }, { id: 'tool-2' }],
    'wpm_tool_executions:byId': {
      'tool-1': { ...toolExecution, id: 'tool-1' },
      'tool-2': { ...toolExecution, id: 'tool-2' },
    },
  });
  const fetchCalls: string[] = [];

  const result = await processPendingWebhookToolExecutions({
    supabase,
    batchSize: 2,
    getEnv: () => 'https://hooks.zapier.com/hooks/catch/demo',
    fetcher: async (url: string | URL | Request) => {
      fetchCalls.push(String(url));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    now: () => 1000,
  });

  assertEquals(result.processed, 2);
  assertEquals(result.succeeded, 2);
  assertEquals(result.failed, 0);
  assertEquals(result.ok, true);
  assertEquals(fetchCalls.length, 2);
  assertEquals((supabase.db.updates as Array<{ payload: Record<string, unknown> }>).map((update) => update.payload.status), [
    'success',
    'success',
  ]);
});

const emailExecution = {
  id: 'email-execution-uuid',
  client_id: 'client-uuid',
  tool_name: 'email.qualified_lead',
  status: 'pending',
  attempt_count: 0,
  input_payload: {
    lead_id: 'lead-uuid',
    bot_profile_id: 'bot-uuid',
    override_to: null,
    channel_label: 'messenger',
    lead: {
      full_name: 'Jane Rivera',
      email: 'jane@example.com',
      phone: '7875550100',
      intent: 'booking_request',
      service_interest: 'private dining',
    },
  },
};

Deno.test('a queued lead email is sent and marked success', async () => {
  const supabase = new SupabaseStub({
    updates: [],
    'wpm_tool_executions:single': emailExecution,
  });
  let received: Record<string, unknown> | null = null;

  const result = await executeEmailToolExecution({
    supabase,
    toolExecutionId: 'email-execution-uuid',
    now: () => 1000,
    send: async (_supabase: unknown, args: Record<string, unknown>) => {
      received = args;
      return { sent: true };
    },
  });

  assertEquals(result.status, 'success');
  assertEquals(received!.clientId, 'client-uuid');
  assertEquals(received!.botProfileId, 'bot-uuid');
  assertEquals(received!.email, 'jane@example.com');
  assertEquals(received!.channelLabel, 'messenger');
  const payload = (supabase.db.updates as Array<{ payload: Record<string, unknown> }>).at(-1)!.payload;
  assertEquals(payload.status, 'success');
  assertEquals(payload.attempt_count, 1);
});

Deno.test('an account with nobody to email fails permanently rather than retrying forever', async () => {
  const supabase = new SupabaseStub({
    updates: [],
    'wpm_tool_executions:single': emailExecution,
  });

  const result = await executeEmailToolExecution({
    supabase,
    toolExecutionId: 'email-execution-uuid',
    now: () => 1000,
    send: async () => ({ sent: false, reason: 'no handoff contact, business email, or account email' }),
  });

  assertEquals(result.status, 'failed');
  const payload = (supabase.db.updates as Array<{ payload: Record<string, unknown> }>).at(-1)!.payload;
  assertEquals(payload.next_attempt_at, null);
});

Deno.test('a transient mail failure keeps the notification queued', async () => {
  const supabase = new SupabaseStub({
    updates: [],
    'wpm_tool_executions:single': emailExecution,
  });

  const result = await executeEmailToolExecution({
    supabase,
    toolExecutionId: 'email-execution-uuid',
    now: () => 1_000_000,
    send: async () => ({ sent: false, reason: 'Resend 503' }),
  });

  assertEquals(result.status, 'pending');
  const payload = (supabase.db.updates as Array<{ payload: Record<string, unknown> }>).at(-1)!.payload;
  assertEquals(payload.attempt_count, 1);
  assertEquals(payload.next_attempt_at, new Date(1_060_000).toISOString());
});

Deno.test('the batch router sends email rows by email and webhook rows by HTTP', async () => {
  const supabase = new SupabaseStub({
    updates: [],
    'wpm_tool_executions:list': [
      { id: 'tool-1', tool_name: 'zapier.qualified_lead' },
      { id: 'tool-2', tool_name: 'email.qualified_lead' },
    ],
    'wpm_tool_executions:byId': {
      'tool-1': { ...toolExecution, id: 'tool-1' },
      'tool-2': { ...emailExecution, id: 'tool-2' },
    },
  });
  const posted: string[] = [];
  let emailsSent = 0;

  const result = await processPendingWebhookToolExecutions({
    supabase,
    batchSize: 2,
    getEnv: () => 'https://hooks.zapier.com/hooks/catch/demo',
    fetcher: async (url: string | URL | Request) => {
      posted.push(String(url));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    sendEmail: async () => {
      emailsSent += 1;
      return { sent: true };
    },
    now: () => 1000,
  });

  assertEquals(result.processed, 2);
  assertEquals(result.succeeded, 2);
  assertEquals(posted.length, 1); // only the webhook row was POSTed
  assertEquals(emailsSent, 1);    // only the email row was mailed
});
