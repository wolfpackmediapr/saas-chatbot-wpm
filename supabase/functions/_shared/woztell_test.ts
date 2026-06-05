import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { normalizeWoztellPayload } from './woztell.ts';

Deno.test('normalizeWoztellPayload extracts Meta-style nested messaging payloads', () => {
  const result = normalizeWoztellPayload({
    object: 'instagram',
    entry: [
      {
        id: 'ig-page-123',
        messaging: [
          {
            sender: { id: 'ig-user-456' },
            recipient: { id: 'ig-page-123' },
            timestamp: 1780677600000,
            message: {
              mid: 'ig-mid-789',
              text: 'Need catering info for Saturday',
            },
          },
        ],
      },
    ],
  });

  if (!result.ok) throw new Error(result.error);

  assertEquals(result.data.channelType, 'instagram');
  assertEquals(result.data.externalPageId, 'ig-page-123');
  assertEquals(result.data.externalUserId, 'ig-user-456');
  assertEquals(result.data.externalConversationId, 'ig-user-456');
  assertEquals(result.data.externalMessageId, 'ig-mid-789');
  assertEquals(result.data.messageText, 'Need catering info for Saturday');
});

Deno.test('normalizeWoztellPayload extracts Woztell-native messageEvent member and channel fields', () => {
  const result = normalizeWoztellPayload({
    messageEvent: {
      type: 'TEXT',
      from: 'psid-or-phone-456',
      to: 'fb-page-123',
      messageId: 'woztell-message-789',
      timestamp: 1780677600000,
      data: {
        text: 'My name is Jane Rivera and I need private dining for 30 people Friday',
      },
    },
    member: {
      _id: 'woztell-member-456',
      externalId: 'psid-or-phone-456',
      firstName: 'Jane',
      lastName: 'Rivera',
      channel: 'woztell-channel-123',
      platform: 'facebook',
      botId: 'woztell-bot-999',
    },
    channel: {
      _id: 'woztell-channel-123',
      type: 'facebook',
      info: {
        pageId: 'fb-page-123',
      },
    },
  });

  if (!result.ok) throw new Error(result.error);

  assertEquals(result.data.channelType, 'facebook');
  assertEquals(result.data.providerChannelId, 'woztell-channel-123');
  assertEquals(result.data.providerBotId, 'woztell-bot-999');
  assertEquals(result.data.externalPageId, 'fb-page-123');
  assertEquals(result.data.externalUserId, 'woztell-member-456');
  assertEquals(result.data.providerRecipientId, 'psid-or-phone-456');
  assertEquals(result.data.externalConversationId, 'woztell-member-456');
  assertEquals(result.data.externalUserName, 'Jane Rivera');
  assertEquals(result.data.externalMessageId, 'woztell-message-789');
  assertEquals(result.data.rawEventType, 'TEXT');
  assertEquals(result.data.messageText, 'My name is Jane Rivera and I need private dining for 30 people Friday');
});
