import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { processPendingWebhookToolExecutions } from '../_shared/wpm_actions.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-wpm-action-secret, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function getSupabaseAdmin() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false as const, error: 'Missing Supabase service configuration.' };
  }

  return {
    ok: true as const,
    supabase: createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }),
  };
}

function isAuthorized(req: Request): boolean {
  const expectedSecret = Deno.env.get('WPM_ACTION_PROCESSOR_SECRET');
  if (!expectedSecret) return false;

  const providedSecret = req.headers.get('x-wpm-action-secret') ?? '';
  return providedSecret === expectedSecret;
}

async function readBatchSize(req: Request): Promise<number> {
  try {
    const body = await req.json();
    const rawBatchSize = typeof body?.batchSize === 'number' ? body.batchSize : Number(body?.batchSize ?? 10);
    return Number.isFinite(rawBatchSize) ? rawBatchSize : 10;
  } catch {
    return 10;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);
  }

  if (!isAuthorized(req)) {
    return jsonResponse({ ok: false, error: 'Unauthorized.' }, 401);
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    return jsonResponse({ ok: false, error: admin.error }, 500);
  }

  const batchSize = await readBatchSize(req);
  const result = await processPendingWebhookToolExecutions({
    supabase: admin.supabase,
    batchSize,
    getEnv: (name) => Deno.env.get(name),
  });

  return jsonResponse({
    ...result,
    results: result.results.map((row) => ({
      id: row.id,
      ok: row.ok,
      status: row.status,
      httpStatus: row.httpStatus,
      error: row.error,
    })),
  }, result.ok ? 200 : 207);
});
