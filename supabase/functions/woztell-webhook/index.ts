import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { persistInboundWoztellMessage } from '../_shared/wpm_bridge.ts';
import { createWoztellTextResponse, normalizeWoztellPayload } from '../_shared/woztell.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
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
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let rawPayload: unknown;

  try {
    rawPayload = await request.json();
  } catch (_error) {
    return jsonResponse({ error: 'Invalid JSON payload' }, 400);
  }

  const normalized = normalizeWoztellPayload(rawPayload);
  const supabase = getSupabaseAdmin();
  let eventId: string | null = null;
  let insertError: string | null = null;

  if (supabase) {
    const { data, error } = await supabase
      .from('wpm_webhook_events')
      .insert({
        provider: 'woztell',
        event_type: normalized.ok ? normalized.data.rawEventType : 'normalization_error',
        external_event_id: normalized.ok ? normalized.data.externalMessageId : null,
        raw_payload: rawPayload,
        normalized_payload: normalized.ok ? normalized.data : normalized.data,
        status: normalized.ok ? 'received' : 'failed',
        error_message: normalized.ok ? null : normalized.error,
      })
      .select('id')
      .single();

    if (error) {
      insertError = error.message;
    } else {
      eventId = data?.id ?? null;
    }
  }

  if (!normalized.ok) {
    return jsonResponse({
      ok: false,
      eventId,
      error: normalized.error,
      insertError,
      response: createWoztellTextResponse('Thanks for reaching out. A team member will follow up shortly.'),
    }, 200);
  }

  if (!supabase) {
    return jsonResponse({
      ok: true,
      mode: 'local_no_supabase_env',
      eventId,
      insertError,
      normalized: normalized.data,
      response: createWoztellTextResponse('Webhook received. WPM Bridge logging is active.'),
    });
  }

  const persistence = await persistInboundWoztellMessage(supabase, normalized.data, rawPayload, eventId);

  if (!persistence.ok) {
    return jsonResponse({
      ok: false,
      eventId,
      insertError,
      persistence,
      normalized: normalized.data,
      response: createWoztellTextResponse('Thanks for reaching out. A team member will follow up shortly.'),
    }, 200);
  }

  return jsonResponse({
    ok: true,
    eventId,
    insertError,
    persistence,
    normalized: normalized.data,
    response: createWoztellTextResponse('Webhook received and logged. WPM Bridge persistence is active.'),
  });
});
