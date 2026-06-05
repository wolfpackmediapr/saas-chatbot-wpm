import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildChannelLookupOrFilter,
  buildConversationUpsertPayload,
  buildInboundMessageInsertPayload,
  type ChannelMatch,
} from './wpm_bridge.ts';
import type { NormalizedWoztellPayload } from './woztell.ts';

const normalized: NormalizedWoztellPayload = {
  provider: 'woztell',
  channelType: 'instagram',
  providerChannelId: 'woztell-instagram-channel-demo',
  providerBotId: 'woztell-bot-demo',
  providerRecipientId: 'ig-user-demo-001',
  externalPageId: 'instagram-page-demo',
  externalPhoneNumber: null,
  externalConversationId: 'ig-conversation-demo-001',
  externalUserId: 'ig-user-demo-001',
  externalUserName: 'Demo Instagram User',
  externalMessageId: 'ig-message-demo-001',
  messageText: 'Hi, do you have availability this Friday?',
  timestamp: '2026-06-05T12:00:00.000Z',
  attachments: [],
  rawEventType: 'message_received',
};

const channel: ChannelMatch = {
  id: 'channel-uuid',
  client_id: 'client-uuid',
  channel_type: 'instagram',
  provider: 'woztell',
  provider_channel_id: 'woztell-instagram-channel-demo',
  provider_bot_id: 'woztell-bot-demo',
  external_page_id: 'instagram-page-demo',
  external_phone_number: null,
  bot_profiles: [{ id: 'bot-profile-uuid', is_active: true }],
};

Deno.test('buildChannelLookupOrFilter prioritizes exact provider channel, page, phone, and bot identifiers', () => {
  assertEquals(
    buildChannelLookupOrFilter(normalized),
    'provider_channel_id.eq.woztell-instagram-channel-demo,external_page_id.eq.instagram-page-demo,provider_bot_id.eq.woztell-bot-demo',
  );
});

Deno.test('buildConversationUpsertPayload maps normalized inbound message to conversation row', () => {
  assertEquals(buildConversationUpsertPayload(normalized, channel), {
    client_id: 'client-uuid',
    channel_id: 'channel-uuid',
    bot_profile_id: 'bot-profile-uuid',
    channel_type: 'instagram',
    external_conversation_id: 'ig-conversation-demo-001',
    external_user_id: 'ig-user-demo-001',
    external_user_name: 'Demo Instagram User',
    status: 'active',
    last_message_at: '2026-06-05T12:00:00.000Z',
    metadata: {
      provider: 'woztell',
      provider_channel_id: 'woztell-instagram-channel-demo',
      external_page_id: 'instagram-page-demo',
    },
  });
});

Deno.test('buildInboundMessageInsertPayload maps normalized inbound message to message row', () => {
  assertEquals(buildInboundMessageInsertPayload(normalized, channel, 'conversation-uuid', { raw: true }), {
    conversation_id: 'conversation-uuid',
    client_id: 'client-uuid',
    direction: 'inbound',
    role: 'user',
    content: 'Hi, do you have availability this Friday?',
    attachments: [],
    raw_payload: { raw: true },
    provider_message_id: 'ig-message-demo-001',
    metadata: {
      provider: 'woztell',
      channel_type: 'instagram',
      external_user_id: 'ig-user-demo-001',
      external_conversation_id: 'ig-conversation-demo-001',
    },
    created_at: '2026-06-05T12:00:00.000Z',
  });
});
