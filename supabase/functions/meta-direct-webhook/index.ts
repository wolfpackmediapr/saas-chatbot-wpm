/**
 * meta-direct-webhook — Direct Meta (Facebook Messenger + Instagram) webhook
 *
 * Replaces the old Dialogflow integration on App ID 928985544799600.
 * Handles:
 *   GET  → Meta webhook verification (hub.mode=subscribe, hub.verify_token, hub.challenge)
 *   POST → Inbound messaging events from Facebook Messenger and Instagram DMs
 *
 * Reuses the existing WPM bridge pipeline: normalize → persist → AI reply → Graph API send → lead extraction
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { createOpenAIChatClient, generateAndStoreAssistantReply } from '../_shared/wpm_ai.ts';
import { pickActiveBotProfileId, type ChannelMatch } from '../_shared/wpm_bridge.ts';
import { extractLeadFromConversationText, persistQualifiedLeadAndQueueActions } from '../_shared/wpm_leads.ts';

// ---------------------------------------------------------------------------
// Types for Meta webhook payload
// ---------------------------------------------------------------------------

interface MetaMessageEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    attachments?: Array<{ type: string; payload?: { url?: string } }>;
    is_echo?: boolean;
  };
  postback?: {
    mid?: string;
    title: string;
    payload: string;
  };
  read?: { watermark: number };
  delivery?: { watermarks: number };
}

interface NormalizedMetaPayload {
  platform: 'messenger' | 'instagram';
  pageId: string;
  senderId: string;
  messageId: string | null;
  text: string | null;
  rawEventType: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// CORS + JSON helpers
// ---------------------------------------------------------------------------

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function textResponse(body: string, status = 200) {
  return new Response(body, { status, headers: corsHeaders });
}

// ---------------------------------------------------------------------------
// Supabase admin client
// ---------------------------------------------------------------------------

function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// Normalize a single Meta messaging event
// ---------------------------------------------------------------------------

function normalizeMetaEvents(
  entry: { id: string; messaging?: MetaMessageEvent[] },
  platform: 'messenger' | 'instagram',
): NormalizedMetaPayload[] {
  const results: NormalizedMetaPayload[] = [];

  for (const event of entry.messaging ?? []) {
    // Skip echo messages (sent by the page itself), delivery, and read receipts
    if (event.message?.is_echo || event.delivery || event.read) continue;

    let text: string | null = null;
    let messageId: string | null = null;
    let rawEventType = 'unknown';

    if (event.message) {
      text = event.message.text ?? null;
      messageId = event.message.mid ?? null;
      rawEventType = 'message';
    } else if (event.postback) {
      text = event.postback.payload ?? event.postback.title;
      messageId = event.postback.mid ?? null;
      rawEventType = 'postback';
    }

    results.push({
      platform,
      pageId: entry.id,
      senderId: event.sender.id,
      messageId,
      text,
      rawEventType,
      timestamp: event.timestamp ?? Date.now(),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Send reply via Facebook Graph API (direct, no Woztell)
// ---------------------------------------------------------------------------

async function sendGraphApiReply(
  recipientId: string,
  text: string,
  pageAccessToken: string,
): Promise<{ ok: boolean; response?: unknown; error?: string }> {
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
    return { ok: resp.ok, response: body };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (request: Request) => {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ── GET: Meta webhook verification ──────────────────────────────────────
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const expectedToken = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === expectedToken && challenge) {
      console.log('[meta-direct] Webhook verified successfully');
      return textResponse(challenge);
    }

    console.warn('[meta-direct] Verification failed', { mode, tokenMatch: token === expectedToken });
    return jsonResponse({ error: 'Verification failed' }, 403);
  }

  // ── POST: Inbound webhook events ────────────────────────────────────────
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // deno-lint-ignore no-explicit-any
  let rawPayload: any;
  try {
    rawPayload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  // Meta sends { object: "page"|"instagram", entry: [...] }
  const objectType = rawPayload?.object;
  const entries = rawPayload?.entry;

  if (!objectType || !Array.isArray(entries)) {
    return jsonResponse({ received: true });
  }

  const platform: 'messenger' | 'instagram' =
    objectType === 'instagram' ? 'instagram' : 'messenger';

  const supabase = getSupabaseAdmin();

  for (const entry of entries) {
    const events = normalizeMetaEvents(entry, platform);

    for (const event of events) {
      if (!event.text || event.rawEventType === 'unknown') continue;

      console.log(`[meta-direct] ${event.platform} from ${event.senderId}: "${event.text.substring(0, 80)}"`);

      // ── Persist raw webhook event ────────────────────────────────────
      if (supabase) {
        await supabase.from('wpm_webhook_events').insert({
          provider: `meta_${event.platform}`,
          event_type: event.rawEventType,
          external_event_id: event.messageId,
          raw_payload: rawPayload,
          normalized_payload: event,
          status: 'received',
        });
      }

      if (!supabase) {
        console.warn('[meta-direct] No Supabase — skipping');
        continue;
      }

      // ── Channel lookup by page ID ────────────────────────────────────
      const { data: channels } = await supabase
        .from('wpm_client_channels')
        .select('id, client_id, channel_type, provider, provider_channel_id, provider_bot_id, external_page_id, external_phone_number, bot_profiles:wpm_bot_profiles(id, is_active)')
        .or(`external_page_id.eq.${event.pageId},provider_channel_id.eq.${event.pageId}`)
        .eq('is_active', true)
        .limit(1);

      const channel: ChannelMatch | null = channels?.[0] ?? null;

      if (!channel) {
        console.warn(`[meta-direct] No channel for pageId=${event.pageId}`);
        continue;
      }

      const botProfileId = pickActiveBotProfileId(channel);

      const channelType = event.platform === 'messenger' ? 'facebook' : event.platform;

      // ── Conversation upsert ──────────────────────────────────────────
      // Use a stable external_conversation_id for Meta DM threads (page + sender)
      const externalConversationId = `${event.pageId}:${event.senderId}`;

      const { data: convData } = await supabase
        .from('wpm_conversations')
        .upsert(
          {
            client_id: channel.client_id,
            channel_id: channel.id,
            bot_profile_id: botProfileId,
            external_conversation_id: externalConversationId,
            external_user_id: event.senderId,
            channel_type: channelType,
            status: 'active',
            last_message_at: new Date(event.timestamp).toISOString(),
          },
          { onConflict: 'client_id,channel_type,external_conversation_id,external_user_id' },
        )
        .select('id')
        .single();

      const conversationId = convData?.id;
      if (!conversationId) {
        console.error('[meta-direct] Conversation upsert failed');
        continue;
      }

      // ── Store inbound message ────────────────────────────────────────
      await supabase.from('wpm_messages').insert({
        conversation_id: conversationId,
        role: 'user',
        content: event.text,
        provider_message_id: event.messageId,
        metadata: { platform: event.platform, sender_id: event.senderId },
      });

      // ── Generate AI reply ────────────────────────────────────────────
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openaiKey) {
        console.warn('[meta-direct] No OPENAI_API_KEY');
        continue;
      }

      const aiClient = createOpenAIChatClient(openaiKey);
      const aiResult = await generateAndStoreAssistantReply({
        supabase,
        openAI: aiClient,
        conversationId,
        inboundMessage: event.text,
      });

      if (!aiResult.ok) {
        console.error('[meta-direct] AI failed:', aiResult.error);
        continue;
      }

      const replyText = aiResult.content;

      // ── Send reply via Graph API ─────────────────────────────────────
      const pageAccessToken = Deno.env.get('META_PAGE_ACCESS_TOKEN');
      if (!pageAccessToken) {
        console.warn('[meta-direct] No META_PAGE_ACCESS_TOKEN');
        continue;
      }

      const sendResult = await sendGraphApiReply(event.senderId, replyText, pageAccessToken);
      console.log(`[meta-direct] Send: ${sendResult.ok ? 'OK' : sendResult.error}`);

      // Update webhook event status
      if (event.messageId) {
        await supabase
          .from('wpm_webhook_events')
          .update({
            status: sendResult.ok ? 'processed' : 'send_failed',
            response_payload: sendResult,
          })
          .eq('external_event_id', event.messageId);
      }

      // ── Lead extraction ──────────────────────────────────────────────
      try {
        const lead = extractLeadFromConversationText({
          inboundText: event.text,
          assistantText: replyText,
          sourceChannel: event.platform,
        });

        if (lead.isQualified) {
          await persistQualifiedLeadAndQueueActions({
            supabase,
            clientId: channel.client_id,
            conversationId,
            lead,
          });
        }
      } catch (err) {
        console.error('[meta-direct] Lead extraction error:', err);
      }
    }
  }

  // Meta requires 200 within 20 seconds
  return jsonResponse({ received: true });
});
