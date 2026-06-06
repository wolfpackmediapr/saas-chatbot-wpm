export type ChannelType = 'instagram' | 'facebook' | 'whatsapp' | 'web_chat' | 'test';
export type ChannelProvider = 'woztell' | 'meta' | 'web';

export interface ChannelSetupInput {
  id?: string;
  channel_type: ChannelType;
  provider?: ChannelProvider;
  provider_channel_id?: string;
  provider_bot_id?: string;
  external_page_id?: string;
  external_phone_number?: string;
  display_name: string;
  notes?: string;
  botapi_token?: string;
  access_token?: string;
  webhook_secret?: string;
}

export interface NormalizedChannelInput {
  channel_type: ChannelType;
  provider: ChannelProvider;
  display_name: string;
  provider_channel_id: string;
  provider_bot_id: string;
  external_page_id: string;
  external_phone_number: string;
  notes: string;
}

export interface ChannelValidationErrors {
  channel_type?: string;
  display_name?: string;
  provider_channel_id?: string;
  external_page_id?: string;
  external_phone_number?: string;
  botapi_token?: string;
  access_token?: string;
  webhook_secret?: string;
}

export interface ChannelPayload {
  id?: string;
  client_id: string;
  channel_type: ChannelType;
  provider: ChannelProvider;
  provider_channel_id: string | null;
  provider_bot_id: string | null;
  external_page_id: string | null;
  external_phone_number: string | null;
  display_name: string;
  is_active: true;
  metadata: {
    self_setup: true;
    secret_storage: 'server_side_only';
    notes: string | null;
  };
}

export interface ChannelCompletionSource {
  channel_type: ChannelType;
  is_active: boolean;
}

export interface ChannelCompletion {
  activeCount: number;
  liveCount: number;
  testCount: number;
  totalCount: number;
  percentComplete: number;
  blockers: string[];
  ready: boolean;
}

export interface ChannelProviderInstructions {
  provider: ChannelProvider;
  label: string;
  summary: string;
  safeFields: string[];
  secretWarning: string;
}

const CHANNEL_TYPE_LABELS: Record<ChannelType, string> = {
  instagram: 'Instagram DMs',
  facebook: 'Facebook Messenger',
  whatsapp: 'WhatsApp',
  web_chat: 'Website chat',
  test: 'Internal test channel',
};

const PROVIDER_INSTRUCTIONS: Record<ChannelProvider, ChannelProviderInstructions> = {
  woztell: {
    provider: 'woztell',
    label: 'Woztell',
    summary: 'Use Woztell as the Meta/WhatsApp inbox and BotAPI bridge. This page stores routing IDs only.',
    safeFields: ['Woztell channel ID', 'Woztell bot ID', 'Meta page ID or WhatsApp phone number'],
    secretWarning: 'Never paste BotAPI tokens in the browser. Store them in Supabase secrets or the WPM Bridge backend.',
  },
  meta: {
    provider: 'meta',
    label: 'Meta direct',
    summary: 'Use direct Meta page/phone mapping when OAuth or server-side token storage is configured.',
    safeFields: ['Meta page ID or WhatsApp phone number'],
    secretWarning: 'Never paste page access tokens in the browser. Tokens must stay server-side.',
  },
  web: {
    provider: 'web',
    label: 'Web chat / test',
    summary: 'Use a browser-safe test or embedded website chat mapping for simulator and QA flows.',
    safeFields: ['Display name'],
    secretWarning: 'No browser-visible runtime secrets are required for test channels.',
  },
};

function clean(value?: string): string {
  return value?.trim() ?? '';
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const normalized = digits.length === 10 ? `1${digits}` : digits;
  if (normalized.length < 7) return `+${normalized}`;
  return `+${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

function isLiveChannel(channelType?: ChannelType): boolean {
  return channelType !== 'test' && channelType !== 'web_chat';
}

export function getChannelTypeLabel(channelType: ChannelType): string {
  return CHANNEL_TYPE_LABELS[channelType];
}

export function getChannelProviderInstructions(provider: ChannelProvider = 'woztell'): ChannelProviderInstructions {
  return PROVIDER_INSTRUCTIONS[provider];
}

export function normalizeChannelInput(input: Partial<ChannelSetupInput>): NormalizedChannelInput {
  const channelType = input.channel_type ?? 'test';
  const provider = input.provider ?? (channelType === 'test' || channelType === 'web_chat' ? 'web' : 'woztell');

  return {
    channel_type: channelType,
    provider,
    display_name: clean(input.display_name),
    provider_channel_id: clean(input.provider_channel_id),
    provider_bot_id: clean(input.provider_bot_id),
    external_page_id: clean(input.external_page_id),
    external_phone_number: maskPhone(clean(input.external_phone_number)),
    notes: clean(input.notes),
  };
}

export function validateChannelInput(input: Partial<ChannelSetupInput>): ChannelValidationErrors {
  const normalized = normalizeChannelInput(input);
  const errors: ChannelValidationErrors = {};

  if (!input.channel_type) {
    errors.channel_type = 'Choose a channel type.';
  }

  if (!normalized.display_name) {
    errors.display_name = 'Channel display name is required.';
  }

  if (normalized.provider === 'woztell' && isLiveChannel(normalized.channel_type) && !normalized.provider_channel_id) {
    errors.provider_channel_id = 'Woztell channel ID is required for this live channel.';
  }

  if (input.botapi_token) {
    errors.botapi_token = 'Do not paste BotAPI tokens or secrets in the browser. Store secrets server-side.';
  }

  if (input.access_token) {
    errors.access_token = 'Do not paste access tokens in the browser. Store secrets server-side.';
  }

  if (input.webhook_secret) {
    errors.webhook_secret = 'Do not paste webhook secrets in the browser. Store secrets server-side.';
  }

  return errors;
}

export function buildChannelPayload(input: ChannelSetupInput, clientId: string): ChannelPayload {
  const normalized = normalizeChannelInput(input);
  const payload: ChannelPayload = {
    client_id: clientId,
    channel_type: normalized.channel_type,
    provider: normalized.provider,
    provider_channel_id: normalized.provider_channel_id || null,
    provider_bot_id: normalized.provider_bot_id || null,
    external_page_id: normalized.external_page_id || null,
    external_phone_number: normalized.external_phone_number || null,
    display_name: normalized.display_name,
    is_active: true,
    metadata: {
      self_setup: true,
      secret_storage: 'server_side_only',
      notes: normalized.notes || null,
    },
  };

  if (input.id) payload.id = input.id;

  return payload;
}

export function getChannelCompletion(channels: ChannelCompletionSource[]): ChannelCompletion {
  const totalCount = channels.length;
  const activeChannels = channels.filter((channel) => channel.is_active);
  const activeCount = activeChannels.length;
  const testCount = activeChannels.filter((channel) => channel.channel_type === 'test').length;
  const liveCount = activeChannels.filter((channel) => channel.channel_type !== 'test').length;
  const blockers: string[] = [];

  if (activeCount === 0) {
    blockers.push('Add at least one active channel mapping.');
  }

  return {
    activeCount,
    liveCount,
    testCount,
    totalCount,
    percentComplete: totalCount === 0 ? 0 : Math.round((activeCount / totalCount) * 100),
    blockers,
    ready: blockers.length === 0,
  };
}
