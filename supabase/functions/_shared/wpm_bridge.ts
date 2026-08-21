/**
 * The channel kinds a WPM client can connect. Mirrors the CHECK constraint on
 * wpm_client_channels.channel_type.
 *
 * 'whatsapp' is present and unused: WhatsApp arrives through the Meta Cloud
 * API, not through a separate provider, so the column already accepts it.
 */
export type WpmChannelType = 'instagram' | 'facebook' | 'whatsapp' | 'web_chat' | 'test';

export interface ChannelMatch {
  id: string;
  client_id: string;
  channel_type: WpmChannelType;
  provider: string;
  provider_channel_id: string | null;
  provider_bot_id: string | null;
  external_page_id: string | null;
  external_phone_number: string | null;
  page_access_token?: string | null;
  bot_profile_id?: string | null;
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

export function pickActiveBotProfileId(channel: ChannelMatch): string | null {
  return channel.bot_profiles?.find((profile) => profile.is_active !== false)?.id ?? null;
}

/**
 * Populate channel.bot_profiles, preferring the channel's assigned bot
 * (bot_profile_id) and falling back to the client's first active bot when
 * unassigned or the assigned bot is inactive/deleted.
 */
export async function loadBotProfilesForChannel(
  supabase: SupabaseLike,
  channel: ChannelMatch,
): Promise<void> {
  if (channel.bot_profile_id) {
    const { data } = await supabase
      .from('wpm_bot_profiles')
      .select('id, is_active')
      .eq('id', channel.bot_profile_id)
      .eq('is_active', true)
      .limit(1);
    if (data?.length) {
      channel.bot_profiles = data;
      return;
    }
  }
  // Fallback for channels with no explicit assignment. The ORDER BY is
  // load-bearing: without it Postgres may return any active agent, and heap
  // order shifts as rows are updated, so a client with two agents could have
  // DMs answered by a different one from request to request. Oldest-first
  // matches what the Channel Connections dropdown labels "Default (<name>)",
  // which lists agents by created_at ascending — the UI must not name an agent
  // the router doesn't actually pick.
  const { data } = await supabase
    .from('wpm_bot_profiles')
    .select('id, is_active')
    .eq('client_id', channel.client_id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1);
  channel.bot_profiles = data ?? [];
}
