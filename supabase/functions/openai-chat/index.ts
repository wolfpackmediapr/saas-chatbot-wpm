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

function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function openai(
  path: string,
  method: string,
  body: unknown,
  apiKey: string,
): Promise<unknown> {
  const res = await fetch(`https://api.openai.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2',
    },
    body: body !== null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } })?.error?.message
      ?? `OpenAI error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = request.headers.get('Authorization');
  const jwt = authHeader?.replace('Bearer ', '');
  if (!jwt) return jsonResponse({ error: 'No authorization token' }, 401);

  const supabase = getSupabaseAdmin();
  const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !user) return jsonResponse({ error: 'Invalid token' }, 401);

  let body: { action?: string; botId?: string; threadId?: string; message?: string };
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { action, botId, threadId, message } = body;

  // Look up the user's bot — active one or by explicit ID
  const baseQuery = supabase
    .from('ai_bots')
    .select('id, api_key, assistant_id')
    .eq('user_id', user.id);

  const { data: bot, error: botError } = botId
    ? await baseQuery.eq('id', botId).maybeSingle()
    : await baseQuery.eq('is_active', true).maybeSingle();

  if (botError) return jsonResponse({ error: botError.message }, 500);
  if (!bot?.api_key) return jsonResponse({ error: 'No active bot with an API key configured' }, 422);

  const apiKey = bot.api_key as string;

  // Resolve assistant ID: bot row first, then user_settings fallback
  let assistantId = (bot.assistant_id as string | null) ?? null;
  if (!assistantId) {
    const { data: settings } = await supabase
      .from('user_settings')
      .select('openai_assistant_id')
      .eq('user_id', user.id)
      .maybeSingle();
    assistantId = (settings as { openai_assistant_id?: string | null } | null)?.openai_assistant_id ?? null;
  }

  // ── create_thread ─────────────────────────────────────────────────────────
  if (action === 'create_thread') {
    try {
      const thread = await openai('/threads', 'POST', {}, apiKey) as { id: string };
      return jsonResponse({ threadId: thread.id });
    } catch (err) {
      return jsonResponse({ error: (err as Error).message }, 502);
    }
  }

  // ── send_message ──────────────────────────────────────────────────────────
  if (action === 'send_message') {
    if (!threadId) return jsonResponse({ error: 'threadId is required' }, 400);
    if (!message) return jsonResponse({ error: 'message is required' }, 400);
    if (!assistantId) return jsonResponse({ error: 'No Assistant ID configured for this bot' }, 422);

    try {
      // Add user message to the thread
      await openai(`/threads/${threadId}/messages`, 'POST', { role: 'user', content: message }, apiKey);

      // Start a run
      const run = await openai(
        `/threads/${threadId}/runs`,
        'POST',
        { assistant_id: assistantId },
        apiKey,
      ) as { id: string; status: string };

      // Poll until terminal state
      let pollDelay = 500;
      while (true) {
        await new Promise((r) => setTimeout(r, pollDelay));
        pollDelay = Math.min(pollDelay * 2, 4000);

        const status = await openai(
          `/threads/${threadId}/runs/${run.id}`,
          'GET',
          null,
          apiKey,
        ) as { status: string; last_error?: { message?: string } };

        if (status.status === 'completed') {
          const msgs = await openai(
            `/threads/${threadId}/messages`,
            'GET',
            null,
            apiKey,
          ) as { data: Array<{ content: Array<{ type: string; text?: { value: string } }> }> };

          const latest = msgs.data[0]?.content[0];
          const reply = latest?.type === 'text' && latest.text?.value
            ? latest.text.value
            : 'Response received but could not be displayed.';

          return jsonResponse({ reply });
        }

        if (status.status === 'failed') {
          return jsonResponse({
            error: `Run failed: ${status.last_error?.message ?? 'Unknown error'}`,
          }, 502);
        }

        if (status.status === 'cancelled' || status.status === 'expired') {
          return jsonResponse({ error: `Run ${status.status}` }, 502);
        }

        // Tool calls are not injected in this proxy flow, but cancel gracefully if seen
        if (status.status === 'requires_action') {
          await openai(`/threads/${threadId}/runs/${run.id}/cancel`, 'POST', {}, apiKey);
          return jsonResponse({ error: 'Tool execution is not supported in this flow' }, 422);
        }
      }
    } catch (err) {
      return jsonResponse({ error: (err as Error).message }, 502);
    }
  }

  return jsonResponse({ error: `Unknown action: ${action ?? '(none)'}` }, 400);
});
