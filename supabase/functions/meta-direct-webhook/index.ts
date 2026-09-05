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
import { describeAttachments } from '../_shared/wpm_meta_attachments.ts';
import {
  checkConversationAllowance,
  conversationCapWindowStart,
  describeBlock,
  noticeForBlock,
} from '../_shared/wpm_usage.ts';
import { closeHandoff, decideHandoffAction, openHandoff, matchEmergencyKeyword, matchEscalationRequest } from '../_shared/wpm_handoff.ts';
import { sendEscalationEmail } from '../_shared/wpm_email.ts';
import { describeSendFailure, extractSentMessageId, fetchMetaUserProfile, GRAPH_API_BASE } from '../_shared/wpm_meta_api.ts';
import { normalizeMetaEvents } from '../_shared/wpm_meta_normalize.ts';

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
// Send reply via Facebook Graph API
// ---------------------------------------------------------------------------

async function sendGraphApiReply(
  recipientId: string,
  text: string,
  pageAccessToken: string,
): Promise<{ ok: boolean; response?: unknown; error?: string }> {
  try {
    const resp = await fetch(
      `${GRAPH_API_BASE}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
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

    // A delivery that produces no usable event used to vanish: 200 returned,
    // nothing written, no way to tell whether Meta sent nothing of interest or
    // we dropped something we should have handled. Record it instead.
    if (events.length === 0 && supabase) {
      const raw = entry as {
        messaging?: Array<Record<string, unknown>>;
        standby?: Array<Record<string, unknown>>;
      };
      const kindOf = (m: Record<string, unknown>) =>
        m.message
          ? ((m.message as { is_echo?: boolean }).is_echo ? 'echo' : 'message')
          : m.delivery
            ? 'delivery'
            : m.read
              ? 'read'
              : m.postback
                ? 'postback'
                : m.reaction
                  ? 'reaction'
                  : 'other';
      const kinds = (raw.messaging ?? []).map(kindOf);
      // Handover protocol: when another app is the page's primary receiver,
      // real customer messages arrive under `standby`, not `messaging`. That
      // is never noise — it means we are silently losing messages.
      const standbyKinds = (raw.standby ?? []).map((m) => `standby:${kindOf(m)}`);
      // Echoes and receipts are normal chatter from our own replies — the
      // interesting case is anything else arriving and going nowhere.
      const onlyNoise = standbyKinds.length === 0 && kinds.length > 0 &&
        kinds.every((k) => k === 'echo' || k === 'delivery' || k === 'read');
      // TEMP DIAGNOSTIC (2026-08-09, Meta bug 3243304265853478): while Page
      // deliveries are dead, record even noise-only messenger deliveries so we
      // can see the moment Meta sends anything at all for the page object.
      // Scoped to messenger on purpose — Instagram's read/echo chatter is
      // constant and would bloat wpm_webhook_events with full raw payloads for
      // no diagnostic value.
      //
      // Gated on META_FORCE_RECORD_MESSENGER=1 so this can live on main without
      // being on by default: unsetting the secret retires the tripwire without a
      // deploy. Once Meta's bug is resolved, delete the flag and this block's
      // `|| forceRecordForOutage` — the standby detection above stays.
      const forceRecordForOutage = platform === 'messenger' &&
        Deno.env.get('META_FORCE_RECORD_MESSENGER') === '1';
      if (!onlyNoise || forceRecordForOutage) {
        const allKinds = [...kinds, ...standbyKinds];
        console.warn(`[meta-direct] ${platform} delivery produced no events: ${allKinds.join(', ') || 'empty'}`);
        await supabase.from('wpm_webhook_events').insert({
          provider: `meta_${platform}`,
          event_type: onlyNoise ? 'noise' : 'unhandled',
          external_event_id: null,
          raw_payload: rawPayload,
          normalized_payload: { entry_kinds: allKinds },
          status: 'ignored',
          error_message: `Delivery produced no usable event (${allKinds.join(', ') || 'empty messaging array'})`,
        });
      }
    }

    for (const event of events) {
      if (!event.text || event.rawEventType === 'unknown') {
        console.warn(
          `[meta-direct] ${platform} event skipped — text=${event.text ? 'yes' : 'no'} type=${event.rawEventType}`,
        );
        if (supabase) {
          await supabase.from('wpm_webhook_events').insert({
            provider: `meta_${platform}`,
            event_type: event.rawEventType,
            external_event_id: event.messageId,
            raw_payload: rawPayload,
            normalized_payload: event,
            status: 'ignored',
            // Name the attachment types. A delivery carrying only an empty
            // Instagram phone-card template is normal and expected; "no text"
            // alone made it look like a defect and told nobody which kind.
            error_message: event.attachments.length > 0
              ? `Skipped: attachment carried no readable content (${
                [...new Set(event.attachments.map((a) => a.type))].join(', ')
              })`
              : `Skipped: no text (type ${event.rawEventType})`,
          });
        }
        continue;
      }

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

      // ── Attribute the webhook event now that the tenant is known ─────
      // The row is inserted before channel lookup so unmatched deliveries are
      // still recorded, but nothing used to backfill these — every row had a
      // NULL client_id, which also meant the "view owned webhook events" RLS
      // policy could never match and owners saw none of their own events.
      if (event.messageId) {
        await supabase
          .from('wpm_webhook_events')
          .update({
            client_id: channel.client_id,
            channel_id: channel.id,
            conversation_id: conversationId,
          })
          .eq('external_event_id', event.messageId);
      }

      // ── Echo: the BUSINESS sent this, not the customer ───────────────
      // Store it and stop. An echo is the only way we ever learn about a reply
      // typed straight into the Instagram or Messenger app — and until 08-31
      // they were discarded, so those replies existed nowhere: not in the
      // Inbox, and not in the agent's context, which is built from
      // wpm_messages. The bot would then answer as though its colleague had
      // never spoken, and could contradict them outright.
      //
      // Recorded as role='human' deliberately: toChatMessage() in wpm_ai.ts
      // already renders that as a colleague's turn, and decideHandoffAction
      // already treats it as a person owning the conversation. Both start
      // working for phone replies with no further change.
      //
      // No AI reply, no lead extraction, no usage metering: we are recording
      // our own outbound message, and the customer must never be billed or
      // answered for it.
      if (event.isEcho) {
        // Our own API sends echo back too. Those are already recorded — by
        // generateAndStoreAssistantReply for the AI, and by inbox-reply for a
        // takeover — both of which now store the mid the Send API returned.
        // Without this check every bot reply would appear twice.
        let alreadyRecorded = false;
        if (event.messageId) {
          const { data: existing } = await supabase
            .from('wpm_messages')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('provider_message_id', event.messageId)
            .limit(1)
            .maybeSingle();
          alreadyRecorded = Boolean(existing);
        }

        if (alreadyRecorded) {
          console.log(`[meta-direct] Echo of our own send mid=${event.messageId} — already recorded`);
        } else {
          await supabase.from('wpm_messages').insert({
            conversation_id: conversationId,
            client_id: channel.client_id,
            direction: 'outbound',
            role: 'human',
            content: event.text,
            provider_message_id: event.messageId,
            metadata: {
              platform: event.platform,
              // Names the surface, so the Inbox and any future audit can tell a
              // phone reply from one typed in the dashboard.
              sent_from: 'native_app',
              ...(event.attachments.length > 0 ? { attachments: event.attachments } : {}),
            },
          });
          console.log(`[meta-direct] Stored ${event.platform} echo from the business in ${conversationId}`);
        }

        await supabase
          .from('wpm_conversations')
          .update({ last_message_at: new Date(event.timestamp).toISOString() })
          .eq('id', conversationId);

        if (event.messageId) {
          await supabase
            .from('wpm_webhook_events')
            .update({ status: 'processed', processed_at: new Date().toISOString() })
            .eq('external_event_id', event.messageId);
        }
        continue;
      }

      // ── Store inbound message ────────────────────────────────────────
      const inboundStoredAt = new Date().toISOString();
      await supabase.from('wpm_messages').insert({
        created_at: inboundStoredAt,
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
      // Unless the human has gone quiet: without this, one takeover silenced
      // the bot for that customer permanently and ghosted them.
      let inHandoff = convData?.status === 'handoff';
      if (inHandoff) {
        const decision = await decideHandoffAction(supabase, conversationId);
        if (decision.action === 'reply') {
          console.log(`[meta-direct] Handoff on ${conversationId} — AI replying (${decision.reason})`);
          if (decision.returnToBot) {
            await closeHandoff(supabase, {
              clientId: channel.client_id,
              conversationId,
              reason: decision.reason ?? 'Returned to bot',
            });
          }
          inHandoff = false;
        }
      }

      if (inHandoff) {
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

      // Persist escalation before allowance, API-key, AI, or delivery failures
      // can stop this turn. Manual takeovers have already been respected above.
      const escalate = async (reason: string, priority: 'urgent' | 'normal') => {
        const { opened } = await openHandoff(supabase, {
          clientId: channel.client_id,
          conversationId,
          reason,
          priority,
          source: 'auto',
          metadata: { platform: event.platform, triggered_by_message_id: event.messageId ?? null },
        });

        // Only mail on a genuinely new handoff — an escalated conversation keeps
        // being answered, so it can re-trigger on every message.
        if (opened) {
          console.log(`[meta-direct] Handoff opened for ${conversationId}: ${reason}`);
          const mail = await sendEscalationEmail(supabase, {
            clientId: channel.client_id,
            botProfileId: botProfileId ?? null,
            reason,
            priority,
            channelLabel: event.platform === 'instagram' ? 'Instagram' : 'Facebook Messenger',
            customerName: externalUserName ?? null,
            lastMessage: event.text,
          });
          if (!mail.sent) console.warn(`[meta-direct] Escalation email not sent: ${mail.reason}`);
        }
      };
      let emergencyKeywords: string[] = [];
      if (botProfileId) {
        const { data: escalationConfig, error: configError } = await supabase
          .from('wpm_bot_instructions').select('emergency_keywords')
          .eq('bot_profile_id', botProfileId).eq('is_active', true)
          .order('version', { ascending: false }).limit(1).maybeSingle();
        if (configError) console.warn('[meta-direct] Escalation config unavailable:', configError.message);
        emergencyKeywords = escalationConfig?.emergency_keywords ?? [];
      }
      const emergencyHit = matchEmergencyKeyword(event.text, emergencyKeywords);
      const humanRequest = matchEscalationRequest(event.text);
      if (emergencyHit || humanRequest) {
        await escalate(
          emergencyHit ? `Emergency keyword: "${emergencyHit}"` : `Customer asked for a human: "${humanRequest}"`,
          emergencyHit ? 'urgent' : 'normal',
        );
      }

      // ── Usage caps: pause AI when the account allowance or this single
      // conversation's reply cap runs out. Either way the conversation stays in
      // the Inbox so a human can still reply.
      const allowance = await checkConversationAllowance(supabase, channel.client_id, conversationId);
      if (!allowance.allowed) {
        const notice = noticeForBlock(allowance.reason);
        const noticeKey = allowance.reason === 'conversation_cap'
          ? 'conversation_cap_notice'
          : 'usage_cap_notice';
        console.warn(`[meta-direct] ${allowance.reason} reached (${allowance.used}/${allowance.max}) for client ${channel.client_id} — AI reply skipped`);

        // Tell the customer once so they aren't ignored. For the reply cap that
        // means once per window, not once per conversation: the cap now recurs
        // each window, and a once-ever notice would leave the customer in
        // total silence every window after the first.
        let noticeQuery = supabase
          .from('wpm_messages')
          .select('id')
          .eq('conversation_id', conversationId)
          .eq('metadata->>generated_by', noticeKey);
        if (allowance.reason === 'conversation_cap') {
          noticeQuery = noticeQuery.gt('created_at', conversationCapWindowStart());
        }
        const { data: priorNotice } = await noticeQuery.limit(1).maybeSingle();

        if (!priorNotice && pageAccessToken) {
          const noticeSend = await sendGraphApiReply(event.senderId, notice, pageAccessToken);
          if (noticeSend.ok) {
            await supabase.from('wpm_messages').insert({
              conversation_id: conversationId,
              client_id: channel.client_id,
              direction: 'outbound',
              role: 'assistant',
              content: notice,
              metadata: { generated_by: noticeKey },
            });
          }
        }

        if (event.messageId) {
          await supabase
            .from('wpm_webhook_events')
            .update({
              status: 'ignored',
              error_message: describeBlock(allowance),
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
        // The inbound message was stored above, before this call. Naming it
        // here lets the context loader drop that stored copy instead of
        // sending the same text to the model twice.
        inboundProviderMessageId: event.messageId,
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
      const sendFailure = sendResult.ok ? null : describeSendFailure(sendResult);
      console.log(`[meta-direct] Send: ${sendResult.ok ? 'OK' : sendFailure}`);

      // Record what actually happened to the reply. It was stored before this
      // send (so a crash mid-send cannot lose it), which meant a reply Meta
      // REJECTED still appeared in the Inbox looking delivered — the platform
      // showing a message the customer never received. The row now says which.
      if (aiResult.messageId) {
        const { error: deliveryError } = await supabase
          .from('wpm_messages')
          .update({
            provider_message_id: extractSentMessageId(sendResult.response),
            metadata: {
              ...(aiResult.metadata ?? {}),
              delivery: sendResult.ok ? 'sent' : 'failed',
              delivery_error: sendFailure,
              delivered_at: sendResult.ok ? new Date().toISOString() : null,
            },
          })
          .eq('id', aiResult.messageId);
        // Never let bookkeeping fail the turn — the reply is already sent.
        if (deliveryError) console.warn(`[meta-direct] Delivery status not recorded: ${deliveryError.message}`);
      }

      // A model-only escalation is also recorded. Existing deterministic
      // handoffs are deduplicated by openHandoff.
      if (aiResult.handoffRequested) {
        await escalate(aiResult.handoffReason ?? 'Escalation requested',
          aiResult.handoffReason?.startsWith('Emergency keyword') ? 'urgent' : 'normal');
      }

      // Update webhook event status ('failed' — 'send_failed' violates the
      // status CHECK constraint, so those updates were silently rejected)
      if (event.messageId) {
        await supabase
          .from('wpm_webhook_events')
          .update({
            status: sendResult.ok ? 'processed' : 'failed',
            response_payload: sendResult,
            error_message: sendFailure,
            processed_at: new Date().toISOString(),
          })
          .eq('external_event_id', event.messageId);
      }

      // ── Lead extraction ──────────────────────────────────────────────
      try {
        // Read the previous delivered assistant turn, excluding this turn's
        // reply. "Yes" qualifies only in response to an actual invitation.
        const { data: priorReply, error: priorReplyError } = await supabase
          .from('wpm_messages').select('role, content')
          .eq('conversation_id', conversationId).lt('created_at', inboundStoredAt)
          .or('metadata->>delivery.is.null,metadata->>delivery.neq.failed')
          .or('metadata->>sent_via_graph_api.is.null,metadata->>sent_via_graph_api.neq.false')
          .in('role', ['user', 'assistant', 'human'])
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (priorReplyError) console.warn('[meta-direct] Lead context lookup failed:', priorReplyError.message);
        const lead = extractLeadFromConversationText({
          inboundText: event.text,
          assistantText: replyText,
          sourceChannel: event.platform,
          threadIdentity: { externalUserId: event.senderId, displayName: externalUserName },
          previousAssistantText: priorReply?.role === 'assistant' || priorReply?.role === 'human' ? priorReply.content : undefined,
        });

        if (lead.isQualified) {
          const capture = await persistQualifiedLeadAndQueueActions({
            supabase,
            clientId: channel.client_id,
            conversationId,
            lead,
          });
          if (!capture.ok) console.warn('[meta-direct] Lead persistence failed:', capture.error);
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
