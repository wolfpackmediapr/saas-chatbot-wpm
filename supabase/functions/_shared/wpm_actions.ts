interface SupabaseLike {
  from(table: string): any;
}

export interface ToolIntegrationRow {
  id: string;
  provider: string;
  integration_type: string;
  name: string;
  secret_reference: string | null;
  metadata: Record<string, unknown>;
}

export interface ToolExecutionRow {
  id: string;
  client_id: string;
  conversation_id: string | null;
  integration_id: string | null;
  tool_name: string;
  input_payload: Record<string, unknown>;
  status: 'pending' | 'success' | 'failed' | 'skipped';
  wpm_integrations: ToolIntegrationRow | ToolIntegrationRow[] | null;
}

type EnvResolver = (name: string) => string | undefined;
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function firstOrValue<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

export function resolveWebhookUrl(
  integration: ToolIntegrationRow | ToolIntegrationRow[] | null,
  getEnv: EnvResolver,
): { ok: true; url: string } | { ok: false; error: string } {
  const resolvedIntegration = firstOrValue(integration);

  if (!resolvedIntegration) {
    return { ok: false, error: 'Tool execution is missing integration context' };
  }

  if (!resolvedIntegration.secret_reference) {
    return { ok: false, error: `Integration ${resolvedIntegration.id} is missing secret_reference` };
  }

  const url = getEnv(resolvedIntegration.secret_reference);
  if (!url) {
    return { ok: false, error: `Missing webhook URL secret: ${resolvedIntegration.secret_reference}` };
  }

  if (!/^https:\/\//i.test(url)) {
    return { ok: false, error: `Webhook URL secret ${resolvedIntegration.secret_reference} must be an HTTPS URL` };
  }

  return { ok: true, url };
}

async function markToolExecution(args: {
  supabase: SupabaseLike;
  toolExecutionId: string;
  status: 'success' | 'failed' | 'skipped';
  outputPayload: unknown;
  errorMessage: string | null;
  latencyMs: number;
}) {
  await args.supabase
    .from('wpm_tool_executions')
    .update({
      status: args.status,
      output_payload: args.outputPayload,
      error_message: args.errorMessage,
      latency_ms: args.latencyMs,
    })
    .eq('id', args.toolExecutionId)
    .single();
}

export async function executeWebhookToolExecution(args: {
  supabase: SupabaseLike;
  toolExecutionId: string;
  getEnv: EnvResolver;
  fetcher?: Fetcher;
  now?: () => number;
}): Promise<
  | { ok: true; status: 'success'; httpStatus: number; error: null }
  | { ok: false; status: 'failed' | 'skipped'; httpStatus: number | null; error: string }
> {
  const fetcher = args.fetcher ?? fetch;
  const now = args.now ?? (() => Date.now());
  const startedAt = now();

  const { data: executionData, error: executionError } = await args.supabase
    .from('wpm_tool_executions')
    .select(`
      id,
      client_id,
      conversation_id,
      integration_id,
      tool_name,
      input_payload,
      status,
      wpm_integrations(id, provider, integration_type, name, secret_reference, metadata)
    `)
    .eq('id', args.toolExecutionId)
    .maybeSingle();

  if (executionError) {
    return { ok: false, status: 'failed', httpStatus: null, error: executionError.message };
  }
  if (!executionData) {
    return { ok: false, status: 'failed', httpStatus: null, error: 'Tool execution not found' };
  }

  const execution = executionData as ToolExecutionRow;

  if (execution.status !== 'pending') {
    return {
      ok: false,
      status: 'skipped',
      httpStatus: null,
      error: `Tool execution is not pending (status: ${execution.status})`,
    };
  }

  const webhookUrl = resolveWebhookUrl(execution.wpm_integrations, args.getEnv);

  if (!webhookUrl.ok) {
    await markToolExecution({
      supabase: args.supabase,
      toolExecutionId: args.toolExecutionId,
      status: 'failed',
      outputPayload: null,
      errorMessage: webhookUrl.error,
      latencyMs: now() - startedAt,
    });
    return { ok: false, status: 'failed', httpStatus: null, error: webhookUrl.error };
  }

  try {
    const response = await fetcher(webhookUrl.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(execution.input_payload),
    });
    const responseBody = await parseResponseBody(response);
    const outputPayload = {
      http_status: response.status,
      response_body: responseBody,
    };

    if (!response.ok) {
      const error = `Webhook request failed with HTTP ${response.status}`;
      await markToolExecution({
        supabase: args.supabase,
        toolExecutionId: args.toolExecutionId,
        status: 'failed',
        outputPayload,
        errorMessage: error,
        latencyMs: now() - startedAt,
      });
      return { ok: false, status: 'failed', httpStatus: response.status, error };
    }

    await markToolExecution({
      supabase: args.supabase,
      toolExecutionId: args.toolExecutionId,
      status: 'success',
      outputPayload,
      errorMessage: null,
      latencyMs: now() - startedAt,
    });

    return { ok: true, status: 'success', httpStatus: response.status, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook request failed';
    await markToolExecution({
      supabase: args.supabase,
      toolExecutionId: args.toolExecutionId,
      status: 'failed',
      outputPayload: null,
      errorMessage: message,
      latencyMs: now() - startedAt,
    });
    return { ok: false, status: 'failed', httpStatus: null, error: message };
  }
}

export async function processPendingWebhookToolExecutions(args: {
  supabase: SupabaseLike;
  getEnv: EnvResolver;
  fetcher?: Fetcher;
  now?: () => number;
  batchSize?: number;
}): Promise<{
  ok: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: Array<{
    id: string;
    ok: boolean;
    status: 'success' | 'failed' | 'skipped';
    httpStatus: number | null;
    error: string | null;
  }>;
  error: string | null;
}> {
  const batchSize = Math.min(Math.max(args.batchSize ?? 10, 1), 50);

  const { data, error } = await args.supabase
    .from('wpm_tool_executions')
    .select('id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (error) {
    return {
      ok: false,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      results: [],
      error: error.message,
    };
  }

  const rows = (data ?? []) as Array<{ id: string }>;
  const results: Array<{
    id: string;
    ok: boolean;
    status: 'success' | 'failed' | 'skipped';
    httpStatus: number | null;
    error: string | null;
  }> = [];

  for (const row of rows) {
    const result = await executeWebhookToolExecution({
      supabase: args.supabase,
      toolExecutionId: row.id,
      getEnv: args.getEnv,
      fetcher: args.fetcher,
      now: args.now,
    });

    results.push({
      id: row.id,
      ok: result.ok,
      status: result.status,
      httpStatus: result.httpStatus,
      error: result.error,
    });
  }

  const succeeded = results.filter((result) => result.status === 'success').length;
  const failed = results.filter((result) => result.status === 'failed').length;
  const skipped = results.filter((result) => result.status === 'skipped').length;

  return {
    ok: failed === 0,
    processed: results.length,
    succeeded,
    failed,
    skipped,
    results,
    error: failed > 0 ? `${failed} pending tool execution(s) failed` : null,
  };
}
