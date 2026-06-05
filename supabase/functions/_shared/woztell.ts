export type WpmChannelType = 'instagram' | 'facebook' | 'whatsapp' | 'web_chat' | 'test';

export interface NormalizedWoztellPayload {
  provider: 'woztell';
  channelType: WpmChannelType;
  providerChannelId: string | null;
  providerBotId: string | null;
  providerRecipientId: string | null;
  externalPageId: string | null;
  externalPhoneNumber: string | null;
  externalConversationId: string;
  externalUserId: string;
  externalUserName: string | null;
  externalMessageId: string | null;
  messageText: string;
  timestamp: string;
  attachments: unknown[];
  rawEventType: string | null;
}

export type WoztellNormalizeResult =
  | {
      ok: true;
      data: NormalizedWoztellPayload;
    }
  | {
      ok: false;
      error: string;
      data: Partial<NormalizedWoztellPayload>;
    };

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getPath(source: unknown, paths: string[][]): unknown {
  for (const path of paths) {
    let current: unknown = source;
    let found = true;

    for (const segment of path) {
      if (Array.isArray(current)) {
        const index = Number(segment);
        if (!Number.isInteger(index) || index < 0 || index >= current.length) {
          found = false;
          break;
        }
        current = current[index];
        continue;
      }

      if (!isRecord(current) || !(segment in current)) {
        found = false;
        break;
      }
      current = current[segment];
    }

    if (found && current !== undefined && current !== null && current !== '') {
      return current;
    }
  }

  return null;
}

function toStringOrNull(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function inferChannelType(payload: unknown): WpmChannelType {
  const explicit = toStringOrNull(getPath(payload, [
    ['channelType'],
    ['channel_type'],
    ['channel', 'type'],
    ['member', 'platform'],
    ['source', 'type'],
    ['platform'],
    ['provider', 'channelType'],
  ]))?.toLowerCase();

  if (explicit?.includes('instagram') || explicit === 'ig') return 'instagram';
  if (explicit?.includes('facebook') || explicit === 'fb' || explicit?.includes('messenger')) return 'facebook';
  if (explicit?.includes('whatsapp') || explicit === 'wa') return 'whatsapp';
  if (explicit?.includes('web')) return 'web_chat';
  if (explicit?.includes('test')) return 'test';

  const payloadText = JSON.stringify(payload).toLowerCase();
  if (payloadText.includes('instagram')) return 'instagram';
  if (payloadText.includes('whatsapp')) return 'whatsapp';
  if (payloadText.includes('facebook') || payloadText.includes('messenger')) return 'facebook';

  return 'test';
}

function extractMessageText(payload: unknown): string | null {
  const direct = toStringOrNull(getPath(payload, [
    ['text'],
    ['message', 'text'],
    ['message', 'content'],
    ['data', 'text'],
    ['data', 'message'],
    ['messageEvent', 'data', 'text'],
    ['messageEvent', 'data', 'message'],
    ['event', 'text'],
    ['event', 'message', 'text'],
    ['payload', 'text'],
    ['payload', 'message', 'text'],
    ['entry', '0', 'messaging', '0', 'message', 'text'],
  ]));

  if (direct) return direct;

  if (isRecord(payload)) {
    const body = toStringOrNull(payload.body);
    if (body) return body;
  }

  return null;
}

export function normalizeWoztellPayload(payload: unknown): WoztellNormalizeResult {
  const now = new Date().toISOString();
  const channelType = inferChannelType(payload);

  const providerChannelId = toStringOrNull(getPath(payload, [
    ['providerChannelId'],
    ['provider_channel_id'],
    ['channelId'],
    ['channel_id'],
    ['channel', '_id'],
    ['channel', 'id'],
    ['member', 'channel'],
    ['bot', 'channelId'],
    ['woztell', 'channelId'],
    ['data', 'channelId'],
  ]));

  const providerBotId = toStringOrNull(getPath(payload, [
    ['providerBotId'],
    ['provider_bot_id'],
    ['botId'],
    ['bot_id'],
    ['member', 'botId'],
    ['bot', 'id'],
    ['woztell', 'botId'],
  ]));

  const externalPageId = toStringOrNull(getPath(payload, [
    ['externalPageId'],
    ['external_page_id'],
    ['pageId'],
    ['page_id'],
    ['recipient', 'id'],
    ['page', 'id'],
    ['messageEvent', 'to'],
    ['channel', 'info', 'pageId'],
    ['entry', '0', 'id'],
  ]));

  const externalPhoneNumber = toStringOrNull(getPath(payload, [
    ['externalPhoneNumber'],
    ['external_phone_number'],
    ['phone'],
    ['phoneNumber'],
    ['from'],
    ['sender', 'phone'],
    ['contact', 'phone'],
    ['member', 'externalId'],
  ]));

  const externalUserId = toStringOrNull(getPath(payload, [
    ['externalUserId'],
    ['external_user_id'],
    ['userId'],
    ['user_id'],
    ['member', '_id'],
    ['sender', 'id'],
    ['from', 'id'],
    ['contact', 'id'],
    ['customer', 'id'],
    ['entry', '0', 'messaging', '0', 'sender', 'id'],
  ])) ?? externalPhoneNumber;

  const providerRecipientId = toStringOrNull(getPath(payload, [
    ['providerRecipientId'],
    ['provider_recipient_id'],
    ['recipientId'],
    ['recipient_id'],
    ['member', 'externalId'],
    ['messageEvent', 'from'],
    ['entry', '0', 'messaging', '0', 'sender', 'id'],
  ]));

  const externalConversationId = toStringOrNull(getPath(payload, [
    ['externalConversationId'],
    ['external_conversation_id'],
    ['conversationId'],
    ['conversation_id'],
    ['threadId'],
    ['thread_id'],
    ['chat', 'id'],
    ['conversation', 'id'],
  ])) ?? externalUserId;

  const externalUserName = toStringOrNull(getPath(payload, [
    ['externalUserName'],
    ['external_user_name'],
    ['userName'],
    ['user_name'],
    ['sender', 'name'],
    ['contact', 'name'],
    ['customer', 'name'],
    ['profile', 'name'],
    ['member', 'name'],
  ]));

  const firstName = toStringOrNull(getPath(payload, [['member', 'firstName']]));
  const lastName = toStringOrNull(getPath(payload, [['member', 'lastName']]));
  const resolvedExternalUserName = externalUserName ?? ([firstName, lastName].filter(Boolean).join(' ') || null);

  const externalMessageId = toStringOrNull(getPath(payload, [
    ['externalMessageId'],
    ['external_message_id'],
    ['messageId'],
    ['message_id'],
    ['messageEvent', 'messageId'],
    ['message', 'id'],
    ['mid'],
    ['entry', '0', 'messaging', '0', 'message', 'mid'],
  ]));

  const messageText = extractMessageText(payload);

  const timestamp = toStringOrNull(getPath(payload, [
    ['timestamp'],
    ['createdAt'],
    ['created_at'],
    ['message', 'timestamp'],
    ['messageEvent', 'timestamp'],
    ['entry', '0', 'messaging', '0', 'timestamp'],
  ])) ?? now;

  const attachments = toArray(getPath(payload, [
    ['attachments'],
    ['message', 'attachments'],
    ['payload', 'attachments'],
    ['entry', '0', 'messaging', '0', 'message', 'attachments'],
  ]));

  const rawEventType = toStringOrNull(getPath(payload, [
    ['eventType'],
    ['event_type'],
    ['messageEvent', 'type'],
    ['type'],
    ['event', 'type'],
  ]));

  const normalized: Partial<NormalizedWoztellPayload> = {
    provider: 'woztell',
    channelType,
    providerChannelId,
    providerBotId,
    providerRecipientId,
    externalPageId,
    externalPhoneNumber,
    externalConversationId: externalConversationId ?? undefined,
    externalUserId: externalUserId ?? undefined,
    externalUserName: resolvedExternalUserName,
    externalMessageId,
    messageText: messageText ?? undefined,
    timestamp,
    attachments,
    rawEventType,
  };

  const missing = [
    ['externalUserId', externalUserId],
    ['externalConversationId', externalConversationId],
    ['messageText', messageText],
  ].filter(([, value]) => !value).map(([key]) => key);

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required Woztell payload fields: ${missing.join(', ')}`,
      data: normalized,
    };
  }

  return {
    ok: true,
    data: normalized as NormalizedWoztellPayload,
  };
}

export function createWoztellTextResponse(text: string) {
  return {
    version: 'v1',
    type: 'text',
    text,
  };
}
