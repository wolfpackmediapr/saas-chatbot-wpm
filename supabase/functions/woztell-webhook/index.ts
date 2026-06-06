import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { createOpenAIChatClient, generateAndStoreAssistantReply } from '../_shared/wpm_ai.ts';
import { persistInboundWoztellMessage } from '../_shared/wpm_bridge.ts';
import { extractLeadFromConversationText, persistQualifiedLeadAndQueueActions } from '../_shared/wpm_leads.ts';
import { createWoztellTextResponse, normalizeWoztellPayload, type NormalizedWoztellPayload } from '../_shared/woztell.ts';
import { sendWoztellTextResponse } from '../_shared/woztell_botapi.ts';

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

function sendWoztellReply(text: string, normalized: NormalizedWoztellPayload) {
  return sendWoztellTextResponse({
    accessToken: Deno.env.get('WOZTELL_BOT_API_ACCESS_TOKEN'),
    channelId: normalized.providerChannelId,
    memberId: normalized.externalUserId,
    recipientId: normalized.providerRecipientId ?? normalized.externalUserId,
    text,
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

  if (!persistence.conversationId || !persistence.clientId) {
    const response = createWoztellTextResponse('Thanks for reaching out. A team member will follow up shortly.');

    await supabase
      .from('wpm_webhook_events')
      .update({
        response_payload: response,
        error_message: 'Inbound persistence succeeded without required routing ids',
      })
      .eq('id', eventId);

    return jsonResponse({
      ok: false,
      eventId,
      insertError,
      persistence,
      ai: {
        ok: false,
        error: 'Inbound persistence succeeded without required routing ids',
      },
      normalized: normalized.data,
      response,
    }, 200);
  }

  const openAIKey = Deno.env.get('OPENAI_API_KEY');

  if (!openAIKey) {
    const response = createWoztellTextResponse('Thanks for reaching out. A team member will follow up shortly.');

    await supabase
      .from('wpm_webhook_events')
      .update({
        response_payload: response,
        error_message: 'OPENAI_API_KEY is not configured; returned fallback response',
      })
      .eq('id', eventId);

    return jsonResponse({
      ok: true,
      eventId,
      insertError,
      persistence,
      ai: {
        ok: false,
        error: 'OPENAI_API_KEY is not configured; returned fallback response',
      },
      normalized: normalized.data,
      response,
    });
  }

  const ai = await generateAndStoreAssistantReply({
    supabase,
    openAI: createOpenAIChatClient(openAIKey),
    conversationId: persistence.conversationId,
    inboundMessage: normalized.data.messageText,
  });

  if (!ai.ok) {
    const response = createWoztellTextResponse('Thanks for reaching out. A team member will follow up shortly.');

    await supabase
      .from('wpm_webhook_events')
      .update({
        response_payload: response,
        error_message: ai.error,
      })
      .eq('id', eventId);

    return jsonResponse({
      ok: false,
      eventId,
      insertError,
      persistence,
      ai,
      normalized: normalized.data,
      response,
    }, 200);
  }

  const lead = extractLeadFromConversationText({
    inboundText: normalized.data.messageText,
    assistantText: ai.content,
    sourceChannel: normalized.data.channelType,
  });

  const leadPersistence = await persistQualifiedLeadAndQueueActions({
    supabase,
    clientId: persistence.clientId,
    conversationId: persistence.conversationId,
    lead,
  });

  const outboundSend = await sendWoztellReply(ai.content, normalized.data);
  const response = {
    ok: true,
    delivery: outboundSend.ok ? 'sent_via_woztell_botapi' : 'woztell_botapi_send_failed',
  };

  await supabase
    .from('wpm_webhook_events')
    .update({
      response_payload: {
        ack: response,
        woztell_send: outboundSend,
      },
      error_message: leadPersistence.ok ? outboundSend.error : leadPersistence.error,
    })
    .eq('id', eventId);

  return jsonResponse({
    ok: true,
    eventId,
    insertError,
    persistence,
    ai,
    lead: leadPersistence,
    outboundSend,
    normalized: normalized.data,
    response,
  });
});
