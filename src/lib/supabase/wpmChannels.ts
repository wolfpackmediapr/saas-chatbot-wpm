import { supabase } from './client';
import type { ChannelProvider, ChannelSetupInput, ChannelType, ChannelPayload } from '../wpm/channelSetup';
import { buildChannelPayload } from '../wpm/channelSetup';

export interface WpmClientChannelRecord {
  id: string;
  client_id: string;
  channel_type: ChannelType;
  provider: ChannelProvider;
  provider_channel_id: string | null;
  provider_bot_id: string | null;
  external_page_id: string | null;
  external_phone_number: string | null;
  display_name: string | null;
  verification_token_hash: string | null;
  is_active: boolean;
  metadata: {
    self_setup?: boolean;
    secret_storage?: 'server_side_only';
    notes?: string | null;
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}

export function mapChannelRecordToInput(record: WpmClientChannelRecord): ChannelSetupInput {
  return {
    id: record.id,
    channel_type: record.channel_type,
    provider: record.provider,
    provider_channel_id: record.provider_channel_id ?? '',
    provider_bot_id: record.provider_bot_id ?? '',
    external_page_id: record.external_page_id ?? '',
    external_phone_number: record.external_phone_number ?? '',
    display_name: record.display_name ?? '',
    notes: typeof record.metadata?.notes === 'string' ? record.metadata.notes : '',
  };
}

export async function listOwnedClientChannels(clientId: string): Promise<WpmClientChannelRecord[]> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await (supabase as any)
    .from('wpm_client_channels')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []) as WpmClientChannelRecord[];
}

export async function saveOwnedClientChannel(input: ChannelSetupInput, clientId: string): Promise<WpmClientChannelRecord> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const payload: ChannelPayload = buildChannelPayload(input, clientId);
  const { data, error } = await (supabase as any)
    .from('wpm_client_channels')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) throw error;

  return data as WpmClientChannelRecord;
}

export async function setOwnedClientChannelActive(id: string, clientId: string, isActive: boolean): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { error } = await (supabase as any)
    .from('wpm_client_channels')
    .update({ is_active: isActive })
    .eq('id', id)
    .eq('client_id', clientId);

  if (error) throw error;
}
