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
  attempt_count: number | null;
  wpm_integrations: ToolIntegrationRow | ToolIntegrationRow[] | null;
}

/**
 * How many times a delivery is retried before the lead is parked as `failed`.
 *
 * With the backoff below, six attempts span roughly an hour. Past that the
 * receiver is not coming back on its own and someone needs to look at the URL,
 * which is what a terminal `failed` row is for.
 */
export const MAX_DELIVERY_ATTEMPTS = 6;

/**
 * How long to hold a lead that has nowhere to go yet.
 *
 * Long enough that an unconfigured integration is not re-checked every minute
 * forever, short enough that connecting a CRM delivers the backlog promptly.
 */
export const CONFIG_RETRY_SECONDS = 1800;

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

  // Two sources, in precedence order.
  //
  // `secret_reference` names a Supabase edge-function secret. It stays first so
  // any integration already wired that way keeps working, but it cannot be the
  // only source: a secret per customer means a manual deploy-time change for
  // every signup, which does not survive self-serve.
  //
  // `metadata.webhook_url` is what the Automations page writes when a customer
  // pastes their own Zapier / Make / n8n hook. Until this was read here, the app
  // saved that value and the processor silently ignored it.
  const fromSecret = resolvedIntegration.secret_reference
    ? (getEnv(resolvedIntegration.secret_reference) ?? '').trim()
    : '';

  const rawMetadataUrl = resolvedIntegration.metadata?.webhook_url;
  const fromMetadata = typeof rawMetadataUrl === 'string' ? rawMetadataUrl.trim() : '';

  const url = fromSecret || fromMetadata;

  if (!url) {
    return {
      ok: false,
      error: resolvedIntegration.secret_reference
        ? `No webhook URL: secret ${resolvedIntegration.secret_reference} is unset and no webhook_url is configured on integration ${resolvedIntegration.id}`
        : `No webhook URL configured on integration ${resolvedIntegration.id}`,
    };
  }

  // HTTPS only. These payloads carry a lead's name, email and phone.
  if (!/^https:\/\//i.test(url)) {
    return { ok: false, error: `Webhook URL for integration ${resolvedIntegration.id} must be an HTTPS URL` };
  }

  return { ok: true, url };
}

/**
 * Which failures are worth trying again.
 *
 * Same rule the model-provider plan sets for failover: retry infrastructure
 * failures, never a 4xx. A 400 or a 404 means the URL is wrong or the receiver
 * rejected the shape — retrying that forever burns the queue and hides a
 * configuration error the customer needs to see. 429 is the exception: it is a
 * rate limit, not a malformed request.
 */
export function isRetryableFailure(httpStatus: number | null): boolean {
  if (httpStatus === null) return true; // network error, DNS, timeout
  if (httpStatus === 408 || httpStatus === 425 || httpStatus === 429) return true;
  return httpStatus >= 500;
}

/** Exponential backoff, capped. Attempt 1 waits 1 min, then 2, 4, 8, 16, 30. */
export function backoffSeconds(attempt: number): number {
  return Math.min(60 * Math.pow(2, Math.max(attempt - 1, 0)), 1800);
}

/**
 * Sign the body so the receiver can prove the delivery came from us.
 *
 * A catch-hook URL is a bearer credential: anyone who learns it can post fake
 * leads into a customer's CRM. Signing does not stop that, but it lets a
 * receiver that cares reject anything unsigned. Unsigned delivery stays valid —
 * Zapier and Make ignore unknown headers — so a missing secret degrades to
 * today's behaviour instead of dropping the lead.
 */
async function signBody(body: string, secret: string, timestamp: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function markToolExecution(args: {
  supabase: SupabaseLike;
  toolExecutionId: string;
  // 'pending' is a real outcome here: a retryable failure leaves the row in the
  // queue with a later next_attempt_at rather than burning the lead.
  status: 'success' | 'failed' | 'skipped' | 'pending';
  outputPayload: unknown;
  errorMessage: string | null;
  latencyMs: number;
  attemptCount?: number;
  nextAttemptAt?: string | null;
}) {
  const patch: Record<string, unknown> = {
    status: args.status,
    output_payload: args.outputPayload,
    error_message: args.errorMessage,
    latency_ms: args.latencyMs,
  };

  if (args.attemptCount !== undefined) patch.attempt_count = args.attemptCount;
  if (args.nextAttemptAt !== undefined) patch.next_attempt_at = args.nextAttemptAt;

  await args.supabase
    .from('wpm_tool_executions')
    .update(patch)
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
  | { ok: false; status: 'failed' | 'skipped' | 'pending'; httpStatus: number | null; error: string }
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
      attempt_count,
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
    // A missing or malformed URL is a setup problem, not a delivery failure, and
    // the fix is one paste away in the Automations page. Burning the lead as
    // `failed` would throw away a real customer over an unfinished setup step,
    // so the row is held in the queue and re-checked instead. Deliberately does
    // NOT consume an attempt: waiting on configuration is not a failed send.
    const nextAttemptAt = new Date(now() + CONFIG_RETRY_SECONDS * 1000).toISOString();
    await markToolExecution({
      supabase: args.supabase,
      toolExecutionId: args.toolExecutionId,
      status: 'pending',
      outputPayload: null,
      errorMessage: `${webhookUrl.error} — holding this lead until a webhook is configured`,
      latencyMs: now() - startedAt,
      nextAttemptAt,
    });
    return { ok: false, status: 'pending', httpStatus: null, error: webhookUrl.error };
  }

  const attempt = (execution.attempt_count ?? 0) + 1;

  // A retryable failure stays `pending` with a later next_attempt_at so the next
  // scheduled run picks it up. Only a permanent failure, or exhausting the
  // attempts, parks the row as `failed` for a human to look at.
  const recordFailure = async (
    httpStatus: number | null,
    error: string,
    outputPayload: unknown,
  ): Promise<{ ok: false; status: 'failed' | 'pending'; httpStatus: number | null; error: string }> => {
    const willRetry = isRetryableFailure(httpStatus) && attempt < MAX_DELIVERY_ATTEMPTS;
    const nextAttemptAt = willRetry
      ? new Date(now() + backoffSeconds(attempt) * 1000).toISOString()
      : null;

    await markToolExecution({
      supabase: args.supabase,
      toolExecutionId: args.toolExecutionId,
      status: willRetry ? 'pending' : 'failed',
      outputPayload,
      errorMessage: willRetry ? `${error} (attempt ${attempt}, will retry)` : error,
      latencyMs: now() - startedAt,
      attemptCount: attempt,
      nextAttemptAt,
    });

    return { ok: false, status: willRetry ? 'pending' : 'failed', httpStatus, error };
  };

  try {
    const body = JSON.stringify(execution.input_payload);
    const timestamp = Math.floor(now() / 1000).toString();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // Lets the receiver drop a duplicate rather than create a second contact
      // when a retry lands after the first delivery actually succeeded.
      'X-WPM-Idempotency-Key': args.toolExecutionId,
      'X-WPM-Timestamp': timestamp,
    };

    const signingSecret = args.getEnv('WPM_WEBHOOK_SIGNING_SECRET');
    if (signingSecret) {
      headers['X-WPM-Signature'] = `sha256=${await signBody(body, signingSecret, timestamp)}`;
    }

    const response = await fetcher(webhookUrl.url, { method: 'POST', headers, body });
    const responseBody = await parseResponseBody(response);
    const outputPayload = {
      http_status: response.status,
      response_body: responseBody,
    };

    if (!response.ok) {
      return await recordFailure(
        response.status,
        `Webhook request failed with HTTP ${response.status}`,
        outputPayload,
      );
    }

    await markToolExecution({
      supabase: args.supabase,
      toolExecutionId: args.toolExecutionId,
      status: 'success',
      outputPayload,
      errorMessage: null,
      latencyMs: now() - startedAt,
      attemptCount: attempt,
      nextAttemptAt: null,
    });

    return { ok: true, status: 'success', httpStatus: response.status, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook request failed';
    return await recordFailure(null, message, null);
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
    status: 'success' | 'failed' | 'skipped' | 'pending';
    httpStatus: number | null;
    error: string | null;
  }>;
  error: string | null;
}> {
  const batchSize = Math.min(Math.max(args.batchSize ?? 10, 1), 50);

  // Rows waiting out a backoff must not be picked up early, or the retry
  // schedule collapses into a hot loop against a receiver that is already
  // struggling. A null next_attempt_at is a row that has never been tried.
  const nowIso = new Date(args.now ? args.now() : Date.now()).toISOString();

  const { data, error } = await args.supabase
    .from('wpm_tool_executions')
    .select('id')
    .eq('status', 'pending')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
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
    status: 'success' | 'failed' | 'skipped' | 'pending';
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
