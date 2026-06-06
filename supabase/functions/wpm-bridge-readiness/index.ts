import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { checkWpmBridgeReadiness } from '../_shared/wpm_diagnostics.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wpm-action-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isAuthorized(req: Request): boolean {
  const expectedSecret = Deno.env.get('WPM_ACTION_PROCESSOR_SECRET');
  if (!expectedSecret) return false;
  const providedSecret = req.headers.get('x-wpm-action-secret');
  return providedSecret === expectedSecret;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);
  }

  if (!isAuthorized(req)) {
    return jsonResponse({ ok: false, error: 'Unauthorized.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    const report = await checkWpmBridgeReadiness(null, (name) => Deno.env.get(name));
    return jsonResponse({ ok: false, error: 'Supabase admin env is not configured.', readiness: report }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const report = await checkWpmBridgeReadiness(supabase, (name) => Deno.env.get(name));

  return jsonResponse({ ok: report.ok, readiness: report }, report.ok ? 200 : 424);
});
