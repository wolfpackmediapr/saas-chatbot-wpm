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
import { loadBotProfilesForChannel, pickActiveBotProfileId, type ChannelMatch } from '../_shared/wpm_bridge.ts';
import { extractLeadFromConversationText, persistQualifiedLeadAndQueueActions } from '../_shared/wpm_leads.ts';
import { checkConversationAllowance, USAGE_CAP_NOTICE } from '../_shared/wpm_usage.ts';

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
  attachments: Array<{ type: string; url: string | null }>;
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
// Meta X-Hub-Signature-256 verification (constant-time)
// ---------------------------------------------------------------------------

async function verifyMetaSignature(
  rawBody: Uint8Array,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expectedHex = signatureHeader.slice('sha256='.length);

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, rawBody);
  const computedHex = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (expectedHex.length !== computedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedHex.length; i++) {
    diff |= expectedHex.charCodeAt(i) ^ computedHex.charCodeAt(i);
  }
  return diff === 0;
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
    let attachments: Array<{ type: string; url: string | null }> = [];

    if (event.message) {
      text = event.message.text ?? null;
      messageId = event.message.mid ?? null;
      rawEventType = 'message';
      attachments = (event.message.attachments ?? []).map((a) => ({
        type: a.type ?? 'attachment',
        url: a.payload?.url ?? null,
      }));
      // Attachment-only messages (images, audio, shares, story replies) must
      // still reach the pipeline so the conversation is logged and answered.
      if (!text && attachments.length > 0) {
        const kinds = [...new Set(attachments.map((a) => a.type))].join(', ');
        text = `[User sent: ${kinds}]`;
      }
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
      attachments,
      rawEventType,
      timestamp: event.timestamp ?? Date.now(),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Fetch sender display name from Meta Graph API (best-effort)
// ---------------------------------------------------------------------------

async function fetchMetaUserProfile(
  senderId: string,
  pageAccessToken: string,
  platform: 'messenger' | 'instagram',
): Promise<string | null> {
  try {
    const fields = platform === 'instagram' ? 'name,username' : 'name';
    const resp = await fetch(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(senderId)}?fields=${fields}&access_token=${encodeURIComponent(pageAccessToken)}`,
    );
    if (!resp.ok) return null;
    const data = await resp.json() as { name?: string; username?: string };
    if (platform === 'instagram' && data.username) return `@${data.username}`;
    return data.name ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Voice note transcription (best-effort, never blocks the pipeline)
// ---------------------------------------------------------------------------

const AUDIO_EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'mp4',
  'video/mp4': 'mp4',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
};

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

async function transcribeMetaAudio(
  audioUrl: string,
  openaiKey: string,
): Promise<string | null> {
  try {
    const audioResp = await fetch(audioUrl);
    if (!audioResp.ok) {
      console.warn(`[meta-direct] Audio download failed: ${audioResp.status}`);
      return null;
    }
    const buffer = await audioResp.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_AUDIO_BYTES) {
      console.warn(`[meta-direct] Audio size out of range: ${buffer.byteLength} bytes`);
      return null;
    }

    const contentType = audioResp.headers.get('content-type')?.split(';')[0].trim() ?? 'audio/mp4';
    const ext = AUDIO_EXT_BY_CONTENT_TYPE[contentType] ?? 'mp4';

    const form = new FormData();
    form.append('file', new Blob([buffer], { type: contentType }), `voice-message.${ext}`);
    form.append('model', 'whisper-1');

    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      console.warn(`[meta-direct] Whisper failed: ${resp.status} ${errBody.substring(0, 200)}`);
      return null;
    }
    const data = await resp.json() as { text?: string };
    return data.text?.trim() || null;
  } catch (err) {
    console.warn('[meta-direct] Audio transcription error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Image download → base64 data URL (OpenAI can't always fetch Meta CDN URLs)
// ---------------------------------------------------------------------------

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`[meta-direct] Image download failed: ${resp.status}`);
      return null;
    }
    const contentType = resp.headers.get('content-type')?.split(';')[0].trim() ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;

    const buffer = await resp.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) {
      console.warn(`[meta-direct] Image size out of range: ${buffer.byteLength} bytes`);
      return null;
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return `data:${contentType};base64,${btoa(binary)}`;
  } catch (err) {
    console.warn('[meta-direct] Image download error:', err);
    return null;
  }
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

  // Read raw bytes first so we can verify the HMAC before parsing.
  let rawBodyBytes: Uint8Array;
  try {
    rawBodyBytes = new Uint8Array(await request.arrayBuffer());
  } catch {
    return jsonResponse({ error: 'Failed to read request body' }, 400);
  }

  // Verify Meta's X-Hub-Signature-256 header.
  const appSecret = Deno.env.get('META_APP_SECRET');
  if (appSecret) {
    const sig = request.headers.get('X-Hub-Signature-256');
    const valid = await verifyMetaSignature(rawBodyBytes, sig, appSecret);
    if (!valid) {
      console.warn('[meta-direct] Signature verification failed');
      return jsonResponse({ error: 'Invalid signature' }, 403);
    }
  } else {
    console.warn('[meta-direct] META_APP_SECRET not set — skipping signature check');
  }

  // deno-lint-ignore no-explicit-any
  let rawPayload: any;
  try {
    rawPayload = JSON.parse(new TextDecoder().decode(rawBodyBytes));
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

      if (!supabase) {
        console.warn('[meta-direct] No Supabase — skipping');
        continue;
      }

      // Isolate each event: one failure must not 500 the batch (Meta would
      // retry and re-deliver every event in it).
      try {

      // ── Dedup: Meta retries deliveries; skip mids already recorded ────
      if (event.messageId) {
        const { data: dupe } = await supabase
          .from('wpm_webhook_events')
          .select('id')
          .eq('provider', `meta_${event.platform}`)
          .eq('external_event_id', event.messageId)
          .limit(1)
          .maybeSingle();
        if (dupe) {
          console.log(`[meta-direct] Duplicate delivery for mid=${event.messageId} — skipped`);
          continue;
        }
      }

      // ── Persist raw webhook event ────────────────────────────────────
      await supabase.from('wpm_webhook_events').insert({
        provider: `meta_${event.platform}`,
        event_type: event.rawEventType,
        external_event_id: event.messageId,
        raw_payload: rawPayload,
        normalized_payload: event,
        status: 'received',
      });

      // ── Channel lookup by page ID ────────────────────────────────────
      // Resolve channel_type early so we can filter the lookup and avoid matching
      // a same-page-ID row from the wrong platform (e.g. an IG row with external_page_id
      // equal to the Facebook page ID).
      const channelType = event.platform === 'messenger' ? 'facebook' : event.platform;

      const { data: channels, error: channelError } = await supabase
        .from('wpm_client_channels')
        .select('id, client_id, channel_type, provider, provider_channel_id, provider_bot_id, external_page_id, external_phone_number, page_access_token, bot_profile_id')
        .or(`external_page_id.eq.${event.pageId},provider_channel_id.eq.${event.pageId}`)
        .eq('is_active', true)
        .eq('channel_type', channelType)
        .limit(1);

      if (channelError) {
        console.error(`[meta-direct] Channel query error: ${channelError.message}`);
        continue;
      }

      const channel: ChannelMatch | null = channels?.[0] ?? null;

      if (!channel) {
        console.warn(`[meta-direct] No channel for pageId=${event.pageId} channelType=${channelType}`);
        if (event.messageId) {
          await supabase
            .from('wpm_webhook_events')
            .update({ status: 'unmatched_channel', processed_at: new Date().toISOString() })
            .eq('external_event_id', event.messageId);
        }
        continue;
      }

      await loadBotProfilesForChannel(supabase, channel);

      const botProfileId = pickActiveBotProfileId(channel);

      // Get page access token early — needed for profile fetch and Graph API send.
      // Each connected Page has its own token (stored at OAuth connect time);
      // META_PAGE_ACCESS_TOKEN remains as fallback for legacy channels.
      const pageAccessToken = channel.page_access_token ?? Deno.env.get('META_PAGE_ACCESS_TOKEN');

      // Fetch sender display name from Meta Graph API (best-effort; never blocks processing)
      let externalUserName: string | null = null;
      if (pageAccessToken) {
        externalUserName = await fetchMetaUserProfile(event.senderId, pageAccessToken, event.platform);
      }

      // ── Voice note transcription ─────────────────────────────────────
      // Replace the '[User sent: audio]' placeholder with the actual words so
      // the AI can answer the content and the Inbox shows what was said.
      let transcribedFromAudio = false;
      const audioAttachment = event.attachments.find((a) => a.type === 'audio' && a.url);
      if (audioAttachment?.url) {
        const openaiKeyForAudio = Deno.env.get('OPENAI_API_KEY');
        if (openaiKeyForAudio) {
          const transcript = await transcribeMetaAudio(audioAttachment.url, openaiKeyForAudio);
          if (transcript) {
            event.text = `[Voice message] ${transcript}`;
            transcribedFromAudio = true;
            console.log(`[meta-direct] Transcribed voice note: "${transcript.substring(0, 80)}"`);
          }
        }
      }

      // ── Conversation upsert ──────────────────────────────────────────
      // Use a stable external_conversation_id for Meta DM threads (page + sender)
      const externalConversationId = `${event.pageId}:${event.senderId}`;

      // Omit `status` from payload so on-conflict updates don't reset 'handoff' back to 'active'.
      // New rows get the column default ('active'); existing rows keep their current status.
      // Only include external_user_name when non-null to avoid overwriting a cached name with null.
      const conversationPayload: Record<string, unknown> = {
        client_id: channel.client_id,
        channel_id: channel.id,
        bot_profile_id: botProfileId,
        external_conversation_id: externalConversationId,
        external_user_id: event.senderId,
        channel_type: channelType,
        last_message_at: new Date(event.timestamp).toISOString(),
      };
      if (externalUserName) conversationPayload.external_user_name = externalUserName;

      const { data: convData } = await supabase
        .from('wpm_conversations')
        .upsert(
          conversationPayload,
          { onConflict: 'client_id,channel_type,external_conversation_id,external_user_id' },
        )
        .select('id, status')
        .single();

      const conversationId = convData?.id;
      if (!conversationId) {
        console.error('[meta-direct] Conversation upsert failed');
        continue;
      }

      // ── Store inbound message ────────────────────────────────────────
      await supabase.from('wpm_messages').insert({
        conversation_id: conversationId,
        client_id: channel.client_id,
        direction: 'inbound',
        role: 'user',
        content: event.text,
        provider_message_id: event.messageId,
        metadata: {
          platform: event.platform,
          sender_id: event.senderId,
          ...(event.attachments.length > 0 ? { attachments: event.attachments } : {}),
          ...(transcribedFromAudio ? { transcribed_from_audio: true } : {}),
        },
      });

      // ── Skip AI if a human has taken over this conversation ──────────
      if (convData?.status === 'handoff') {
        console.log(`[meta-direct] Conversation ${conversationId} is in handoff mode — AI response skipped`);
        if (event.messageId) {
          await supabase
            .from('wpm_webhook_events')
            .update({
              status: 'processed',
              response_payload: { handoff: true },
              processed_at: new Date().toISOString(),
            })
            .eq('external_event_id', event.messageId);
        }
        continue;
      }

      // ── Plan usage cap: pause AI when monthly conversations run out ──
      // The conversation stays in the Inbox so a human can still reply.
      const allowance = await checkConversationAllowance(supabase, channel.client_id);
      if (!allowance.allowed) {
        console.warn(`[meta-direct] Conversation cap reached (${allowance.used}/${allowance.max}) for client ${channel.client_id} — AI reply skipped`);

        // Tell the customer once per conversation so they aren't ignored.
        const { data: priorNotice } = await supabase
          .from('wpm_messages')
          .select('id')
          .eq('conversation_id', conversationId)
          .eq('metadata->>generated_by', 'usage_cap_notice')
          .limit(1)
          .maybeSingle();

        if (!priorNotice && pageAccessToken) {
          const noticeSend = await sendGraphApiReply(event.senderId, USAGE_CAP_NOTICE, pageAccessToken);
          if (noticeSend.ok) {
            await supabase.from('wpm_messages').insert({
              conversation_id: conversationId,
              client_id: channel.client_id,
              direction: 'outbound',
              role: 'assistant',
              content: USAGE_CAP_NOTICE,
              metadata: { generated_by: 'usage_cap_notice' },
            });
          }
        }

        if (event.messageId) {
          await supabase
            .from('wpm_webhook_events')
            .update({
              status: 'ignored',
              error_message: `Monthly conversation cap reached (${allowance.used}/${allowance.max})`,
              processed_at: new Date().toISOString(),
            })
            .eq('external_event_id', event.messageId);
        }
        continue;
      }

      // ── Generate AI reply ────────────────────────────────────────────
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openaiKey) {
        console.warn('[meta-direct] No OPENAI_API_KEY');
        continue;
      }

      const aiClient = createOpenAIChatClient(openaiKey);
      const inboundImageUrls: string[] = [];
      for (const attachment of event.attachments.filter((a) => a.type === 'image' && a.url).slice(0, 2)) {
        const dataUrl = await fetchImageAsDataUrl(attachment.url as string);
        if (dataUrl) inboundImageUrls.push(dataUrl);
      }
      if (inboundImageUrls.length > 0) {
        console.log(`[meta-direct] Attaching ${inboundImageUrls.length} image(s) to vision request`);
      }

      const aiResult = await generateAndStoreAssistantReply({
        supabase,
        openAI: aiClient,
        conversationId,
        inboundMessage: event.text,
        imageUrls: inboundImageUrls,
      });

      if (!aiResult.ok) {
        console.error('[meta-direct] AI failed:', aiResult.error);
        if (event.messageId) {
          await supabase
            .from('wpm_webhook_events')
            .update({
              status: 'failed',
              error_message: `AI reply failed: ${aiResult.error}`,
              processed_at: new Date().toISOString(),
            })
            .eq('external_event_id', event.messageId);
        }
        continue;
      }

      const replyText = aiResult.content;

      // ── Send reply via Graph API ─────────────────────────────────────
      if (!pageAccessToken) {
        console.warn(`[meta-direct] No page access token for channel ${channel.id} (and no META_PAGE_ACCESS_TOKEN fallback)`);
        if (event.messageId) {
          await supabase
            .from('wpm_webhook_events')
            .update({
              status: 'failed',
              error_message: 'No page access token for channel',
              processed_at: new Date().toISOString(),
            })
            .eq('external_event_id', event.messageId);
        }
        continue;
      }

      const sendResult = await sendGraphApiReply(event.senderId, replyText, pageAccessToken);
      console.log(`[meta-direct] Send: ${sendResult.ok ? 'OK' : sendResult.error}`);

      // Update webhook event status ('failed' — 'send_failed' violates the
      // status CHECK constraint, so those updates were silently rejected)
      if (event.messageId) {
        await supabase
          .from('wpm_webhook_events')
          .update({
            status: sendResult.ok ? 'processed' : 'failed',
            response_payload: sendResult,
            error_message: sendResult.ok ? null : (sendResult.error ?? JSON.stringify(sendResult.response ?? {})),
            processed_at: new Date().toISOString(),
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

      } catch (err) {
        console.error(`[meta-direct] Event processing failed (mid=${event.messageId}):`, err);
        if (event.messageId) {
          await supabase
            .from('wpm_webhook_events')
            .update({
              status: 'failed',
              error_message: String(err),
              processed_at: new Date().toISOString(),
            })
            .eq('external_event_id', event.messageId);
        }
      }
    }
  }

  // Meta requires 200 within 20 seconds
  return jsonResponse({ received: true });
});
