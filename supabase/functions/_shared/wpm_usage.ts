/**
 * Plan usage allowance checks for the webhook pipeline.
 *
 * "Conversations used" = distinct conversations with an inbound message this
 * calendar month (same definition as the get_wpm_usage RPC / pricing unit).
 * A conversation that already counted this month may continue at the cap;
 * only conversations beyond the cap are blocked. Fails open: any lookup
 * error allows the reply rather than silencing a paying customer's bot.
 */

interface SupabaseLike {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
  // deno-lint-ignore no-explicit-any
  rpc(fn: string, args: Record<string, unknown>): any;
}

export interface ConversationAllowance {
  allowed: boolean;
  used: number | null;
  max: number | null;
}

export async function checkConversationAllowance(
  supabase: SupabaseLike,
  clientId: string,
): Promise<ConversationAllowance> {
  try {
    const { data: client } = await supabase
      .from('wpm_clients')
      .select('owner_user_id')
      .eq('id', clientId)
      .maybeSingle();

    const ownerUserId = (client as { owner_user_id?: string | null } | null)?.owner_user_id;
    if (!ownerUserId) return { allowed: true, used: null, max: null };

    const { data, error } = await supabase.rpc('get_wpm_usage', { p_user_id: ownerUserId });
    if (error || !data?.length) return { allowed: true, used: null, max: null };

    const row = data[0] as { conversations_used: number; max_conversations: number | null };
    if (row.max_conversations === null) {
      return { allowed: true, used: row.conversations_used, max: null };
    }
    return {
      allowed: row.conversations_used <= row.max_conversations,
      used: row.conversations_used,
      max: row.max_conversations,
    };
  } catch {
    return { allowed: true, used: null, max: null };
  }
}

/** Customer-facing notice when the business's plan cap pauses the bot. */
export const USAGE_CAP_NOTICE =
  'Thanks for your message! Our automated assistant is temporarily unavailable — a member of our team will get back to you as soon as possible.';
