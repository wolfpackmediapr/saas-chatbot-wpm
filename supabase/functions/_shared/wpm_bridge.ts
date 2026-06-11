import type { NormalizedWoztellPayload, WpmChannelType } from './woztell.ts';

export interface ChannelMatch {
  id: string;
  client_id: string;
  channel_type: WpmChannelType;
  provider: string;
  provider_channel_id: string | null;
  provider_bot_id: string | null;
  external_page_id: string | null;
  external_phone_number: string | null;
  bot_profiles?: Array<{ id: string; is_active?: boolean }> | null;
}

export interface ConversationMatch {
  id: string;
  client_id: string;
  channel_id: string | null;
  bot_profile_id: string | null;
}

interface SupabaseLike {
  // Supabase's fluent PostgREST builders change type after select/insert/upsert/update.
  // Keep this boundary intentionally loose while preserving strong types for WPM payload builders.
  from(table: string): any;
}

function escapePostgrestValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll(',', '\\,').replaceAll(')', '\\)');
}

export function buildChannelLookupOrFilter(normalized: NormalizedWoztellPayload): string {
  const clauses: string[] = [];

  if (normalized.providerChannelId) {
    clauses.push(`provider_channel_id.eq.${escapePostgrestValue(normalized.providerChannelId)}`);
  }
  if (normalized.externalPageId) {
    clauses.push(`external_page_id.eq.${escapePostgrestValue(normalized.externalPageId)}`);
  }
  if (normalized.externalPhoneNumber) {
    clauses.push(`external_phone_number.eq.${escapePostgrestValue(normalized.externalPhoneNumber)}`);
  }
  if (normalized.providerBotId) {
    clauses.push(`provider_bot_id.eq.${escapePostgrestValue(normalized.providerBotId)}`);
  }

  return clauses.join(',');
}

export function pickActiveBotProfileId(channel: ChannelMatch): string | null {
  return channel.bot_profiles?.find((profile) => profile.is_active !== false)?.id ?? null;
}

export function buildConversationUpsertPayload(normalized: NormalizedWoztellPayload, channel: ChannelMatch) {
  return {
    client_id: channel.client_id,
    channel_id: channel.id,
    bot_profile_id: pickActiveBotProfileId(channel),
    channel_type: normalized.channelType,
    external_conversation_id: normalized.externalConversationId,
    external_user_id: normalized.externalUserId,
    external_user_name: normalized.externalUserName,
    status: 'active',
    last_message_at: normalized.timestamp,
    metadata: {
      provider: normalized.provider,
      provider_channel_id: normalized.providerChannelId,
      external_page_id: normalized.externalPageId,
    },
  };
}

export function buildInboundMessageInsertPayload(
  normalized: NormalizedWoztellPayload,
  channel: ChannelMatch,
  conversationId: string,
  rawPayload: unknown,
) {
  return {
    conversation_id: conversationId,
    client_id: channel.client_id,
    direction: 'inbound',
    role: 'user',
    content: normalized.messageText,
    attachments: normalized.attachments,
    raw_payload: rawPayload,
    provider_message_id: normalized.externalMessageId,
    metadata: {
      provider: normalized.provider,
      channel_type: normalized.channelType,
      external_user_id: normalized.externalUserId,
      external_conversation_id: normalized.externalConversationId,
    },
    created_at: normalized.timestamp,
  };
}

export async function findMatchingChannel(
  supabase: SupabaseLike,
  normalized: NormalizedWoztellPayload,
): Promise<{ channel: ChannelMatch | null; error: string | null }> {
  const orFilter = buildChannelLookupOrFilter(normalized);

  if (!orFilter) {
    return { channel: null, error: 'No channel identifiers available for lookup' };
  }

  const { data, error } = await supabase
    .from('wpm_client_channels')
    .select('id, client_id, channel_type, provider, provider_channel_id, provider_bot_id, external_page_id, external_phone_number')
    .eq('provider', normalized.provider)
    .eq('channel_type', normalized.channelType)
    .eq('is_active', true)
    .or(orFilter)
    .maybeSingle();

  if (error) return { channel: null, error: error.message };
  if (!data) return { channel: null, error: null };

  // No direct FK between wpm_client_channels and wpm_bot_profiles — resolve via client_id
  const channel = data as ChannelMatch;
  const { data: botProfileRows } = await supabase
    .from('wpm_bot_profiles')
    .select('id, is_active')
    .eq('client_id', channel.client_id)
    .eq('is_active', true)
    .limit(1);
  channel.bot_profiles = botProfileRows ?? [];

  return { channel, error: null };
}

export async function persistInboundWoztellMessage(
  supabase: SupabaseLike,
  normalized: NormalizedWoztellPayload,
  rawPayload: unknown,
  webhookEventId: string | null = null,
): Promise<{
  ok: boolean;
  status: 'processed' | 'unmatched_channel' | 'failed';
  channelId: string | null;
  clientId: string | null;
  conversationId: string | null;
  messageId: string | null;
  error: string | null;
}> {
  const channelResult = await findMatchingChannel(supabase, normalized);

  if (channelResult.error) {
    return {
      ok: false,
      status: 'failed',
      channelId: null,
      clientId: null,
      conversationId: null,
      messageId: null,
      error: channelResult.error,
    };
  }

  const channel = channelResult.channel;
  if (!channel) {
    if (webhookEventId) {
      await supabase
        .from('wpm_webhook_events')
        .update({
          status: 'unmatched_channel',
          error_message: 'No active WPM channel matched this Woztell payload',
          processed_at: new Date().toISOString(),
        })
        .eq('id', webhookEventId);
    }

    return {
      ok: false,
      status: 'unmatched_channel',
      channelId: null,
      clientId: null,
      conversationId: null,
      messageId: null,
      error: 'No active WPM channel matched this Woztell payload',
    };
  }

  const conversationPayload = buildConversationUpsertPayload(normalized, channel);
  const { data: conversation, error: conversationError } = await supabase
    .from('wpm_conversations')
    .upsert(conversationPayload, {
      onConflict: 'client_id,channel_type,external_conversation_id,external_user_id',
    })
    .select('id, client_id, channel_id, bot_profile_id')
    .single();

  if (conversationError || !conversation) {
    return {
      ok: false,
      status: 'failed',
      channelId: channel.id,
      clientId: channel.client_id,
      conversationId: null,
      messageId: null,
      error: conversationError?.message ?? 'Conversation upsert returned no row',
    };
  }

  const conversationId = (conversation as ConversationMatch).id;
  const messagePayload = buildInboundMessageInsertPayload(normalized, channel, conversationId, rawPayload);
  const { data: message, error: messageError } = await supabase
    .from('wpm_messages')
    .insert(messagePayload)
    .select('id')
    .single();

  if (messageError || !message) {
    return {
      ok: false,
      status: 'failed',
      channelId: channel.id,
      clientId: channel.client_id,
      conversationId,
      messageId: null,
      error: messageError?.message ?? 'Message insert returned no row',
    };
  }

  if (webhookEventId) {
    await supabase
      .from('wpm_webhook_events')
      .update({
        client_id: channel.client_id,
        channel_id: channel.id,
        conversation_id: conversationId,
        status: 'processed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', webhookEventId);
  }

  return {
    ok: true,
    status: 'processed',
    channelId: channel.id,
    clientId: channel.client_id,
    conversationId,
    messageId: (message as { id: string }).id,
    error: null,
  };
}
