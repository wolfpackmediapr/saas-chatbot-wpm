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
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function sendGraphApiReply(
  recipientId: string,
  text: string,
  pageAccessToken: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
          messaging_type: 'RESPONSE',
        }),
      },
    );
    const body = await resp.json();
    if (!resp.ok) return { ok: false, error: body?.error?.message ?? `HTTP ${resp.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const jwt = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return jsonResponse({ error: 'No authorization token' }, 401);

  const supabase = getSupabaseAdmin();
  const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !user) return jsonResponse({ error: 'Invalid token' }, 401);

  let body: { conversationId?: string; message?: string };
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { conversationId, message } = body;
  if (!conversationId || !message?.trim()) {
    return jsonResponse({ error: 'conversationId and message are required' }, 400);
  }

  // Load conversation and verify ownership via RLS-compatible join
  const { data: conv, error: convError } = await supabase
    .from('wpm_conversations')
    .select(`
      id, client_id, channel_id, channel_type, external_user_id, status,
      wpm_clients!inner(owner_user_id)
    `)
    .eq('id', conversationId)
    .single();

  if (convError || !conv) return jsonResponse({ error: 'Conversation not found' }, 404);

  const clients = conv.wpm_clients as { owner_user_id: string } | { owner_user_id: string }[];
  const ownerUserId = Array.isArray(clients) ? clients[0]?.owner_user_id : clients?.owner_user_id;
  if (ownerUserId !== user.id) return jsonResponse({ error: 'Forbidden' }, 403);

  if (!conv.external_user_id) {
    return jsonResponse({ error: 'No external user ID on this conversation' }, 422);
  }

  // Resolve the per-channel page token (stored at OAuth connect time);
  // META_PAGE_ACCESS_TOKEN remains as fallback for legacy channels.
  let channelQuery = supabase
    .from('wpm_client_channels')
    .select('page_access_token')
    .eq('is_active', true)
    .limit(1);
  channelQuery = conv.channel_id
    ? channelQuery.eq('id', conv.channel_id)
    : channelQuery.eq('client_id', conv.client_id).eq('channel_type', conv.channel_type);
  const { data: channelRows } = await channelQuery;

  const pageAccessToken =
    channelRows?.[0]?.page_access_token ?? Deno.env.get('META_PAGE_ACCESS_TOKEN');
  if (!pageAccessToken) {
    return jsonResponse({ error: 'No page access token for this channel' }, 500);
  }

  // Send to user via Graph API
  const sendResult = await sendGraphApiReply(conv.external_user_id, message.trim(), pageAccessToken);

  // Store outbound message regardless of send success (preserve the record)
  const now = new Date().toISOString();
  await supabase.from('wpm_messages').insert({
    conversation_id: conversationId,
    client_id: conv.client_id,
    direction: 'outbound',
    role: 'human',
    content: message.trim(),
    metadata: { sent_via_graph_api: sendResult.ok, send_error: sendResult.error ?? null },
  });

  // Update conversation timestamp
  await supabase
    .from('wpm_conversations')
    .update({ last_message_at: now })
    .eq('id', conversationId);

  if (!sendResult.ok) {
    console.error(`[inbox-reply] Graph API send failed: ${sendResult.error}`);
    return jsonResponse({ ok: false, sent: false, error: sendResult.error }, 207);
  }

  console.log(`[inbox-reply] Human reply sent to ${conv.external_user_id} in conversation ${conversationId}`);
  return jsonResponse({ ok: true, sent: true });
});
