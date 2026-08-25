import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  checkConversationAllowance,
  CONVERSATION_CAP_WINDOW_HOURS,
  describeBlock,
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
  onCountWindow?: (column: string, value: unknown) => void;
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
        gt(column: string, value: unknown) {
          opts.onCountWindow?.(column, value);
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
  free_trial_expired: false,
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

// Regression guard for the 2026-08-20 production incident. The reply cap
// counted outbound messages for ALL TIME, which made it permanent: an IG/FB DM
// thread is one continuous thread per person for life, so a live thread sat at
// 98 replies with its last bot reply six days earlier and stayed blocked. The
// count MUST be bounded to the rolling window or the bot never recovers.
Deno.test('the reply cap counts only the current window, never all time', async () => {
  let column: string | null = null;
  let bound: unknown = null;
  const supabase = makeSupabase({
    outboundCount: 0,
    ownerUserId: 'user-1',
    usageRow: freeWithinGrant,
    onCountWindow: (c, v) => {
      column = c;
      bound = v;
    },
  });
  await checkConversationAllowance(supabase, 'client-1', 'conv-1');

  assertEquals(column, 'created_at');

  // The bound must sit CONVERSATION_CAP_WINDOW_HOURS back, not at the epoch.
  const ageHours = (Date.now() - new Date(bound as string).getTime()) / 3_600_000;
  assertEquals(Math.round(ageHours), CONVERSATION_CAP_WINDOW_HOURS);
});

// A thread that has run long inside the window is still blocked — the fix
// scopes the cap, it does not remove the runaway-thread guard.
Deno.test('a thread over the cap within the window is still blocked', async () => {
  const supabase = makeSupabase({
    outboundCount: MAX_REPLIES_PER_CONVERSATION + 68, // the live IG thread's 98
    ownerUserId: 'user-1',
    usageRow: freeWithinGrant,
  });
  const result = await checkConversationAllowance(supabase, 'client-1', 'conv-1');

  assertEquals(result.allowed, false);
  assertEquals(result.reason, 'conversation_cap');
});

// The operator-facing string named the wrong limit for both reasons, which sent
// a live debugging session after Meta and plan usage instead of the reply cap.
Deno.test('describeBlock names the limit that actually fired', () => {
  const capped = describeBlock({
    allowed: false,
    used: 98,
    max: 30,
    reason: 'conversation_cap',
  });
  assertEquals(capped.includes('Per-conversation reply cap'), true);
  assertEquals(capped.includes('98/30'), true);
  assertEquals(capped.includes('Monthly'), false);

  const allowance = describeBlock({
    allowed: false,
    used: 1000,
    max: 1000,
    reason: 'account_allowance',
  });
  assertEquals(allowance.includes('Account allowance'), true);
  assertEquals(allowance.includes('reply cap'), false);
});


// ── Free grant is a TRIAL: 1,000 messages OR 7 days, whichever comes first ────

/** Days ran out with most of the message allowance still unused. */
const freeTrialExpired = {
  ...freeWithinGrant,
  messages_lifetime: 212,
  free_trial_expired: true,
  within_allowance: false,
};

Deno.test('an expired trial blocks the reply even with messages left', async () => {
  const supabase = makeSupabase({ outboundCount: 2, ownerUserId: 'user-1', usageRow: freeTrialExpired });
  const allowance = await checkConversationAllowance(supabase, 'conversation-1', 'client-1');
  assertEquals(allowance.allowed, false);
  assertEquals(allowance.reason, 'trial_expired');
});

Deno.test('an expired trial is not reported as a spent message allowance', () => {
  // The 2026-08-20 session was lost to a block that named the wrong limit.
  // 212 of 1,000 messages used: whoever reads this must not go hunting the
  // message counter when the clock is what ran out.
  const described = describeBlock({
    allowed: false,
    used: 212,
    max: 1000,
    reason: 'trial_expired',
  });
  assertStringIncludes(described, 'Free trial expired after 7 days');
  assertStringIncludes(described, 'NOT the limit that fired');
});

Deno.test('an expired trial still gets the permanent-sounding customer notice', () => {
  // Same wording as a spent grant, and correct for the same reason: neither
  // resets, so promising the customer it is temporary would be a lie.
  assertEquals(noticeForBlock('trial_expired'), USAGE_CAP_NOTICE);
});
