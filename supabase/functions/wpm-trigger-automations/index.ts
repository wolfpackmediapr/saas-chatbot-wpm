import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const processorSecret = Deno.env.get('WPM_ACTION_PROCESSOR_SECRET');

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !processorSecret) {
    return jsonResponse({ error: 'Missing environment configuration' }, 500);
  }

  // Create client with user's token to verify identity
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  // Verify the user owns a wpm client
  const { data: client, error: clientError } = await userClient
    .from('wpm_clients')
    .select('id, business_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (clientError || !client) {
    return jsonResponse({ error: 'No WPM client profile found for this user' }, 403);
  }

  // Now use service role to call the processor (or run processing scoped)
  // We call the processor internally with the secret so the user never sees it
  const processorUrl = `${supabaseUrl}/functions/v1/wpm-actions-processor`;

  try {
    const processorRes = await fetch(processorUrl, {
      method: 'POST',
      headers: {
        'x-action-secret': processorSecret,
        'Content-Type': 'application/json',
      },
    });

    const processorResult = await processorRes.json();

    return jsonResponse({
      ok: true,
      message: 'Processor triggered successfully',
      client: client.business_name || client.id,
      processorResult,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: 'Failed to trigger processor', details: msg }, 500);
  }
});
