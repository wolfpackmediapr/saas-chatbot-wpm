import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildChannelLookupOrFilter,
  buildConversationUpsertPayload,
  buildInboundMessageInsertPayload,
  loadBotProfilesForChannel,
  pickActiveBotProfileId,
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

// ── Agent routing ──────────────────────────────────────────────────────────
// A channel with no explicit bot_profile_id falls back to "an active agent for
// the client". That fallback MUST be deterministic: a client can run several
// agents for different businesses, and an unordered LIMIT 1 lets Postgres
// return whichever it likes — so the same Page could be answered by a
// different agent from one message to the next.

interface RecordedQuery {
  table: string;
  eq: Array<[string, unknown]>;
  order: Array<[string, { ascending?: boolean } | undefined]>;
}

function recordingSupabase(resultsByTable: Record<string, unknown[]>) {
  const queries: RecordedQuery[] = [];
  return {
    queries,
    from(table: string) {
      const q: RecordedQuery = { table, eq: [], order: [] };
      queries.push(q);
      const builder: any = {
        select: () => builder,
        eq: (col: string, val: unknown) => { q.eq.push([col, val]); return builder; },
        order: (col: string, opts?: { ascending?: boolean }) => { q.order.push([col, opts]); return builder; },
        limit: () => Promise.resolve({ data: resultsByTable[table] ?? [] }),
      };
      return builder;
    },
  };
}

Deno.test('an explicitly assigned agent is used as-is', async () => {
  const db = recordingSupabase({ wpm_bot_profiles: [{ id: 'pinned-agent', is_active: true }] });
  const ch: ChannelMatch = { ...channel, bot_profile_id: 'pinned-agent', bot_profiles: null };

  await loadBotProfilesForChannel(db, ch);

  assertEquals(pickActiveBotProfileId(ch), 'pinned-agent');
  assertEquals(db.queries[0].eq[0], ['id', 'pinned-agent']);
});

Deno.test('the fallback picks the oldest active agent deterministically', async () => {
  const db = recordingSupabase({ wpm_bot_profiles: [{ id: 'oldest-agent', is_active: true }] });
  const ch: ChannelMatch = { ...channel, bot_profile_id: null, bot_profiles: null };

  await loadBotProfilesForChannel(db, ch);

  assertEquals(pickActiveBotProfileId(ch), 'oldest-agent');

  // Regression guard: without this ORDER BY the router and the Channel
  // Connections "Default (<name>)" label can disagree about who answers.
  const fallback = db.queries[0];
  assertEquals(fallback.eq[0], ['client_id', 'client-uuid']);
  assertEquals(fallback.order, [['created_at', { ascending: true }]]);
});

Deno.test('an assignment pointing at a deactivated agent falls back rather than going silent', async () => {
  // The explicit lookup filters on is_active, so a disabled agent returns []
  // and the client-wide fallback has to run — otherwise the channel would
  // resolve to no agent at all and simply stop replying.
  const db = recordingSupabase({ wpm_bot_profiles: [] });
  const ch: ChannelMatch = { ...channel, bot_profile_id: 'deactivated-agent', bot_profiles: null };

  await loadBotProfilesForChannel(db, ch);

  assertEquals(db.queries.length, 2);
  assertEquals(db.queries[1].order, [['created_at', { ascending: true }]]);
});

Deno.test('pickActiveBotProfileId skips inactive agents', () => {
  const ch: ChannelMatch = {
    ...channel,
    bot_profiles: [{ id: 'off', is_active: false }, { id: 'on', is_active: true }],
  };
  assertEquals(pickActiveBotProfileId(ch), 'on');
});
