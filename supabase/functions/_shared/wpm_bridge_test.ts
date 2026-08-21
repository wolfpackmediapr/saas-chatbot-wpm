import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  loadBotProfilesForChannel,
  pickActiveBotProfileId,
  type ChannelMatch,
} from './wpm_bridge.ts';

const channel: ChannelMatch = {
  id: 'channel-uuid',
  client_id: 'client-uuid',
  channel_type: 'instagram',
  provider: 'meta',
  provider_channel_id: null,
  provider_bot_id: null,
  external_page_id: 'instagram-page-demo',
  external_phone_number: null,
  bot_profiles: [{ id: 'bot-profile-uuid', is_active: true }],
};

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
