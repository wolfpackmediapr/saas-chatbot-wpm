/**
 * Plan usage allowance checks for the webhook pipeline.
 *
 * Two independent limits, both of which pause the bot:
 *
 *  1. Account allowance — free accounts get a one-time 1,000-message lifetime
 *     grant; paid accounts get their monthly conversation cap. The
 *     get_wpm_usage RPC collapses both into `within_allowance`.
 *
 *  2. Per-conversation reply cap — at most MAX_REPLIES_PER_CONVERSATION model
 *     replies in a single thread within CONVERSATION_CAP_WINDOW_HOURS. Real
 *     traffic showed conversations averaging 18,264 tokens with a median of
 *     6,142 and a worst case of 175,854: a 29x spread driven entirely by a few
 *     threads that never ended. Without this cap, any allowance has an
 *     unbounded tail attached, because one runaway conversation can cost what
 *     29 normal ones do.
 *
 *     The window is load-bearing. This counter was originally all-time, which
 *     silently made the cap permanent: an Instagram or Messenger DM thread is
 *     one continuous thread per person for life, so every returning customer
 *     eventually crossed 30 lifetime replies and the bot went mute in that
 *     thread forever, with no path back. Observed in production on 2026-08-20 —
 *     a live IG thread sat at 98 replies with its last bot reply six days
 *     earlier, still blocked. A rolling window keeps the runaway-thread guard
 *     (the actual goal) while letting a healthy thread heal on its own.
 *
 * Both fail open: any lookup error allows the reply rather than silencing a
 * paying customer's bot.
 */

interface SupabaseLike {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
  // deno-lint-ignore no-explicit-any
  rpc(fn: string, args: Record<string, unknown>): any;
}

/**
 * Most model replies allowed in one conversation, per rolling window, before a
 * human takes over.
 */
/**
 * Whose messages count, decided by Wilf on 2026-08-21.
 *
 * FREE accounts are metered on `messages_lifetime`, which counts every row in
 * wpm_messages for the owner's clients — inbound, AI replies, and replies a
 * human typed in the Inbox alike. That is deliberate: a free account is using
 * the platform, and human replies use it too.
 *
 * PAID accounts are metered on `conversations_used`, so a human reply cannot
 * consume a paid allowance — it does not create a conversation. That already
 * matches the policy and is why `get_wpm_usage` was not changed for it.
 *
 * ⚠️ Amended 2026-09-07, and read this before "simplifying" either count:
 * BOTH meters now ignore a conversation the customer has never spoken in.
 * Publimedia shared one Instagram post with 69 accounts; every send echoed back,
 * each echo opened a conversation, and the month went from 8 conversations to 77
 * without a single customer writing a word. On Free that blast would have been
 * 69% of the monthly allowance; on the grant, 69 of 1,000 messages. No model call
 * was made and no token was spent, so there was nothing to price.
 *
 * This does NOT reverse the decision above. A human reply inside a thread a
 * customer started still counts, exactly as before — what stopped counting is a
 * thread the customer never joined. The rule is self-correcting: when a recipient
 * finally answers, that thread becomes billable and its earlier outbound messages
 * count from then on. See the migration
 * `bill_only_conversations_the_customer_joined` for the full reasoning, and
 * `scripts/tests/instruction-history.mjs` for the regression that pins it.
 *
 * The trap is for whoever implements overage. The pricing page advertises
 * "fair overages apply after limit" and nothing charges them yet; the moment
 * something does, billing per message would start charging paying customers
 * for their own staff's typing. Bill paid overage on conversations, or filter
 * `role = 'human'` out of the count first.
 *
 * Revisit the whole policy if Meta's API limits ever become the binding
 * constraint rather than our costs.
 */

export const MAX_REPLIES_PER_CONVERSATION = 30;

/**
 * How far back the per-conversation reply cap counts. Never remove this window
 * — an unwindowed count silences a DM thread permanently. See the note above.
 */
export const CONVERSATION_CAP_WINDOW_HOURS = 24;

/** Start of the current reply-cap window. */
export function conversationCapWindowStart(now: Date = new Date()): string {
  return new Date(now.getTime() - CONVERSATION_CAP_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
}

export type AllowanceBlockReason = 'account_allowance' | 'conversation_cap' | 'trial_expired';

export interface ConversationAllowance {
  allowed: boolean;
  used: number | null;
  max: number | null;
  /** Set only when `allowed` is false — decides which owner alert to send. */
  reason?: AllowanceBlockReason;
  /**
   * Which meter blocked the account: the one-time free grant, or a paid plan's
   * monthly cap. Both arrive as `account_allowance`, but the owner must be told
   * different things — a grant never resets, a plan resets next month.
   */
  meter?: 'free_grant' | 'plan';
  /** When the free trial ends or ended. Keys the trial alert's cap window. */
  trialEndsAt?: string | null;
}

/**
 * Check both limits. `conversationId` is optional so callers that do not have
 * one yet (a brand new thread) still get the account-level check.
 */
export async function checkConversationAllowance(
  supabase: SupabaseLike,
  clientId: string,
  conversationId?: string | null,
): Promise<ConversationAllowance> {
  try {
    // ── 2. Per-conversation reply cap ────────────────────────────────────────
    // Checked first: it is a single indexed count, and a thread that has run
    // away should stop regardless of how much account allowance is left.
    if (conversationId) {
      // The pipeline writes 'outbound'. An earlier version of get_wpm_usage
      // filtered on 'out' and silently counted zero for every account, so match
      // both spellings rather than trusting either one.
      const { count, error: countError } = await supabase
        .from('wpm_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId)
        .in('direction', ['out', 'outbound'])
        .gt('created_at', conversationCapWindowStart());

      if (!countError && typeof count === 'number' && count >= MAX_REPLIES_PER_CONVERSATION) {
        return {
          allowed: false,
          used: count,
          max: MAX_REPLIES_PER_CONVERSATION,
          reason: 'conversation_cap',
        };
      }
    }

    // ── 1. Account allowance ─────────────────────────────────────────────────
    const { data: client } = await supabase
      .from('wpm_clients')
      .select('owner_user_id')
      .eq('id', clientId)
      .maybeSingle();

    const ownerUserId = (client as { owner_user_id?: string | null } | null)?.owner_user_id;
    if (!ownerUserId) return { allowed: true, used: null, max: null };

    const { data, error } = await supabase.rpc('get_wpm_usage', { p_user_id: ownerUserId });
    if (error || !data?.length) return { allowed: true, used: null, max: null };

    const row = data[0] as {
      conversations_used: number;
      max_conversations: number | null;
      messages_lifetime: number;
      free_messages_limit: number | null;
      free_trial_expired: boolean;
      free_trial_ends_at?: string | null;
      within_allowance: boolean;
    };

    // Report against whichever meter actually applies to this account, so the
    // logged "used/max" matches the limit that blocked it.
    const onFreeGrant = row.free_messages_limit !== null;
    const used = onFreeGrant ? row.messages_lifetime : row.conversations_used;
    const max = onFreeGrant ? row.free_messages_limit : row.max_conversations;

    if (row.within_allowance) return { allowed: true, used, max };

    // A free account can be blocked two different ways and the difference
    // matters when triaging "the bot stopped answering": the 7-day trial can
    // run out with most of the 1,000 messages unused, and reporting that as a
    // spent allowance would send whoever is debugging after the wrong number.
    // This is the same mistake that cost the 2026-08-20 session.
    const reason: AllowanceBlockReason = row.free_trial_expired
      ? 'trial_expired'
      : 'account_allowance';

    return {
      allowed: false,
      used,
      max,
      reason,
      meter: onFreeGrant ? 'free_grant' : 'plan',
      trialEndsAt: row.free_trial_ends_at ?? null,
    };
  } catch {
    return { allowed: true, used: null, max: null };
  }
}

/**
 * There is deliberately NO customer-facing notice for a blocked reply.
 *
 * Until 2026-09-15 a block sent the customer "I'm handing this to a member of
 * our team — they'll get back to you shortly." It opened no handoff and emailed
 * nobody, so the promise was kept by no one. In production it reached two of In
 * House Chef's customers after his trial ended, one of whom had already waited
 * thirteen days for a call. It also contradicted the expiry email, which tells
 * the owner the agent "has stopped replying", and it was hardcoded English.
 *
 * Decided by Wilf on 2026-09-15: a blocked reply sends the customer nothing and
 * the OWNER is told instead — see `_shared/wpm_blocked_alerts.ts`. Silence also
 * spends nothing: no Graph send, no stored row, no echo webhook coming back.
 */

/**
 * Operator-facing description of why a reply was blocked, written to
 * `wpm_webhook_events.error_message`.
 *
 * This used to be hardcoded to "Monthly conversation cap reached" for BOTH
 * reasons, so a thread stopped by the per-conversation reply cap reported a
 * billing limit it had not hit. On 2026-08-20 that cost a live debugging
 * session: the logs pointed at plan usage and at Meta while the real cause was
 * the reply cap. Keep this keyed to `reason`.
 */
export function describeBlock(allowance: ConversationAllowance): string {
  const counts = `${allowance.used}/${allowance.max}`;
  if (allowance.reason === 'conversation_cap') {
    return `Per-conversation reply cap reached (${counts} in the last ${CONVERSATION_CAP_WINDOW_HOURS}h)`;
  }
  if (allowance.reason === 'trial_expired') {
    return `Free trial expired after 7 days (${counts} messages used — the message allowance was NOT the limit that fired)`;
  }
  return `Account allowance exhausted (${counts})`;
}
