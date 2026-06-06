/// <reference lib="deno.ns" />

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildChannelPayload,
  getChannelCompletion,
  getChannelProviderInstructions,
  getChannelTypeLabel,
  normalizeChannelInput,
  validateChannelInput,
} from './channelSetup.ts';

Deno.test('validateChannelInput requires safe live channel mapping fields without secrets', () => {
  assertEquals(validateChannelInput({
    channel_type: 'instagram',
    provider: 'woztell',
    display_name: '',
    provider_channel_id: '',
  }), {
    display_name: 'Channel display name is required.',
    provider_channel_id: 'Woztell channel ID is required for this live channel.',
  });

  assertEquals(validateChannelInput({
    channel_type: 'test',
    provider: 'woztell',
    display_name: 'Internal test channel',
  }), {});

  assertEquals(validateChannelInput({
    channel_type: 'whatsapp',
    provider: 'woztell',
    display_name: 'WhatsApp Sales',
    provider_channel_id: 'wzt-channel-123',
    external_phone_number: '+17870000000',
    botapi_token: 'should-not-be-accepted',
  }), {
    botapi_token: 'Do not paste BotAPI tokens or secrets in the browser. Store secrets server-side.',
  });
});

Deno.test('normalizeChannelInput trims IDs and normalizes phone numbers', () => {
  const normalized = normalizeChannelInput({
    channel_type: 'whatsapp',
    provider: 'woztell',
    display_name: ' WhatsApp Sales ',
    provider_channel_id: ' channel-123 ',
    external_phone_number: ' (787) 000-0000 ',
  });

  assertEquals(normalized, {
    channel_type: 'whatsapp',
    provider: 'woztell',
    display_name: 'WhatsApp Sales',
    provider_channel_id: 'channel-123',
    provider_bot_id: '',
    external_page_id: '',
    external_phone_number: '+178' + '*'.repeat(4) + '0000',
    notes: '',
  });
});

Deno.test('buildChannelPayload maps browser-safe setup data to wpm_client_channels', () => {
  assertEquals(buildChannelPayload({
    id: 'channel-row-123',
    channel_type: 'instagram',
    provider: 'woztell',
    display_name: 'IG DMs',
    provider_channel_id: 'wzt-channel-123',
    provider_bot_id: 'bot-456',
    external_page_id: 'ig-page-789',
    notes: 'Client connected through Woztell inbox.',
    botapi_token: 'must-not-be-stored',
  }, 'client-123'), {
    id: 'channel-row-123',
    client_id: 'client-123',
    channel_type: 'instagram',
    provider: 'woztell',
    provider_channel_id: 'wzt-channel-123',
    provider_bot_id: 'bot-456',
    external_page_id: 'ig-page-789',
    external_phone_number: null,
    display_name: 'IG DMs',
    is_active: true,
    metadata: {
      self_setup: true,
      secret_storage: 'server_side_only',
      notes: 'Client connected through Woztell inbox.',
    },
  });
});

Deno.test('getChannelCompletion returns readiness blockers', () => {
  assertEquals(getChannelCompletion([]), {
    activeCount: 0,
    liveCount: 0,
    testCount: 0,
    totalCount: 0,
    percentComplete: 0,
    blockers: ['Add at least one active channel mapping.'],
    ready: false,
  });

  assertEquals(getChannelCompletion([
    { channel_type: 'test', is_active: true },
    { channel_type: 'instagram', is_active: true },
  ]), {
    activeCount: 2,
    liveCount: 1,
    testCount: 1,
    totalCount: 2,
    percentComplete: 100,
    blockers: [],
    ready: true,
  });
});

Deno.test('channel labels and provider instructions guide Woztell setup', () => {
  assertEquals(getChannelTypeLabel('facebook'), 'Facebook Messenger');
  assertEquals(getChannelProviderInstructions('woztell').safeFields, [
    'Woztell channel ID',
    'Woztell bot ID',
    'Meta page ID or WhatsApp phone number',
  ]);
});
