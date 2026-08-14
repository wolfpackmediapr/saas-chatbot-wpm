import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  checkConversationAllowance,
  MAX_REPLIES_PER_CONVERSATION,
  noticeForBlock,
  CONVERSATION_CAP_NOTICE,
  USAGE_CAP_NOTICE,
} from './wpm_usage.ts';

/**
 * Stub shaped like the two calls the module makes: a counting select on
 * wpm_messages, and a single-row select on wpm_clients.
 */
function makeSupabase(opts: {
  outboundCount?: number | null;
  countError?: boolean;
  ownerUserId?: string | null;
  usageRow?: Record<string, unknown> | null;
  rpcError?: boolean;
  onCountFilter?: (column: string, values: unknown[]) => void;
}) {
  return {
    from(table: string) {
      const chain = {
        _count: false,
        select(_cols: string, options?: { count?: string; head?: boolean }) {
          this._count = Boolean(options?.count);
          return this;
        },
        eq(_c: string, _v: unknown) {
          return this;
        },
        in(column: string, values: unknown[]) {
          opts.onCountFilter?.(column, values);
          return this;
        },
        maybeSingle() {
          if (table === 'wpm_clients') {
            return Promise.resolve({
              data: opts.ownerUserId === null ? null : { owner_user_id: opts.ownerUserId },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve: (v: unknown) => void) {
          // The counting query is awaited directly rather than via maybeSingle.
          resolve({
            count: opts.outboundCount ?? null,
            error: opts.countError ? { message: 'boom' } : null,
          });
        },
      };
      return chain;
    },
    rpc(_fn: string, _args: Record<string, unknown>) {
      return Promise.resolve({
        data: opts.usageRow ? [opts.usageRow] : [],
        error: opts.rpcError ? { message: 'boom' } : null,
      });
    },
  };
}

const freeWithinGrant = {
  conversations_used: 3,
  max_conversations: null,
  messages_lifetime: 250,
  free_messages_limit: 1000,
  within_allowance: true,
};

const freeGrantExhausted = {
  ...freeWithinGrant,
  messages_lifetime: 1000,
  within_allowance: false,
};

const paidOverCap = {
  conversations_used: 501,
  max_conversations: 500,
  messages_lifetime: 99999,
  free_messages_limit: null,
  within_allowance: false,
};

Deno.test('a free account inside its 1,000-message grant is allowed', async () => {
  const supabase = makeSupabase({ outboundCount: 2, ownerUserId: 'user-1', usageRow: freeWithinGrant });
  const result = await checkConversationAllowance(supabase, 'client-1', 'conv-1');

  assertEquals(result.allowed, true);
  // Reported against the meter that actually applies — messages, not conversations.
  assertEquals(result.used, 250);
  assertEquals(result.max, 1000);
});

Deno.test('a free account that has spent its grant is blocked on the message meter', async () => {
  const supabase = makeSupabase({ outboundCount: 2, ownerUserId: 'user-1', usageRow: freeGrantExhausted });
  const result = await checkConversationAllowance(supabase, 'client-1', 'conv-1');

  assertEquals(result.allowed, false);
  assertEquals(result.reason, 'account_allowance');
  assertEquals(result.used, 1000);
  assertEquals(result.max, 1000);
});

Deno.test('a paid account over its monthly cap reports conversations, not messages', async () => {
  const supabase = makeSupabase({ outboundCount: 2, ownerUserId: 'user-1', usageRow: paidOverCap });
  const result = await checkConversationAllowance(supabase, 'client-1', 'conv-1');

  assertEquals(result.allowed, false);
  assertEquals(result.reason, 'account_allowance');
  assertEquals(result.used, 501);
  assertEquals(result.max, 500);
});

// The cap exists because one runaway thread cost 29x the median conversation.
Deno.test('a conversation at the reply cap is blocked even with allowance left', async () => {
  const supabase = makeSupabase({
    outboundCount: MAX_REPLIES_PER_CONVERSATION,
    ownerUserId: 'user-1',
    usageRow: freeWithinGrant, // plenty of grant remaining
  });
  const result = await checkConversationAllowance(supabase, 'client-1', 'conv-1');

  assertEquals(result.allowed, false);
  assertEquals(result.reason, 'conversation_cap');
  assertEquals(result.max, MAX_REPLIES_PER_CONVERSATION);
});

// Regression guard: get_wpm_usage filtered direction='out' while the pipeline
// writes 'outbound', so message counts silently read zero for every account.
// The cap must match both spellings or it never fires.
Deno.test('the reply cap counts both direction spellings', async () => {
  let seen: unknown[] = [];
  const supabase = makeSupabase({
    outboundCount: 0,
    ownerUserId: 'user-1',
    usageRow: freeWithinGrant,
    onCountFilter: (_column, values) => {
      seen = values;
    },
  });
  await checkConversationAllowance(supabase, 'client-1', 'conv-1');

  assertEquals(seen.includes('outbound'), true);
  assertEquals(seen.includes('out'), true);
});

Deno.test('a new conversation with no id still gets the account check', async () => {
  const supabase = makeSupabase({ ownerUserId: 'user-1', usageRow: freeGrantExhausted });
  const result = await checkConversationAllowance(supabase, 'client-1');

  assertEquals(result.allowed, false);
  assertEquals(result.reason, 'account_allowance');
});

// Never silence a paying customer's bot because a lookup broke.
Deno.test('lookup failures fail open', async () => {
  const rpcDown = makeSupabase({ outboundCount: 1, ownerUserId: 'user-1', rpcError: true });
  assertEquals((await checkConversationAllowance(rpcDown, 'client-1', 'conv-1')).allowed, true);

  const noOwner = makeSupabase({ outboundCount: 1, ownerUserId: null });
  assertEquals((await checkConversationAllowance(noOwner, 'client-1', 'conv-1')).allowed, true);
});

Deno.test('each block reason gets its own customer-facing notice', () => {
  assertEquals(noticeForBlock('conversation_cap'), CONVERSATION_CAP_NOTICE);
  assertEquals(noticeForBlock('account_allowance'), USAGE_CAP_NOTICE);
  assertEquals(noticeForBlock(undefined), USAGE_CAP_NOTICE);
});
