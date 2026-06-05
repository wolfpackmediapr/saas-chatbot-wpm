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
