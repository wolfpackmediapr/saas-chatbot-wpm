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

export type AllowanceBlockReason = 'account_allowance' | 'conversation_cap';

export interface ConversationAllowance {
  allowed: boolean;
  used: number | null;
  max: number | null;
  /** Set only when `allowed` is false — decides which notice to send. */
  reason?: AllowanceBlockReason;
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
      within_allowance: boolean;
    };

    // Report against whichever meter actually applies to this account, so the
    // logged "used/max" matches the limit that blocked it.
    const onFreeGrant = row.free_messages_limit !== null;
    const used = onFreeGrant ? row.messages_lifetime : row.conversations_used;
    const max = onFreeGrant ? row.free_messages_limit : row.max_conversations;

    return row.within_allowance
      ? { allowed: true, used, max }
      : { allowed: false, used, max, reason: 'account_allowance' };
  } catch {
    return { allowed: true, used: null, max: null };
  }
}

/** Customer-facing notice when the business's plan cap pauses the bot. */
export const USAGE_CAP_NOTICE =
  'Thanks for your message! Our automated assistant is temporarily unavailable — a member of our team will get back to you as soon as possible.';

/**
 * Customer-facing notice when a single conversation has run long. Worded as a
 * handoff rather than an outage, because from the customer's side that is
 * exactly what it is — the thread continues, just with a person.
 */
export const CONVERSATION_CAP_NOTICE =
  "Thanks for all the detail! I'm bringing someone from our team into this conversation so they can help you properly from here.";

/** The right notice for a blocked reply. */
export function noticeForBlock(reason: AllowanceBlockReason | undefined): string {
  return reason === 'conversation_cap' ? CONVERSATION_CAP_NOTICE : USAGE_CAP_NOTICE;
}

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
  return allowance.reason === 'conversation_cap'
    ? `Per-conversation reply cap reached (${counts} in the last ${CONVERSATION_CAP_WINDOW_HOURS}h)`
    : `Account allowance exhausted (${counts})`;
}
