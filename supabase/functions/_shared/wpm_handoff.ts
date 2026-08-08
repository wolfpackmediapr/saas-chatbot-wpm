/**
 * Human handoff: state transitions, escalation detection, and auto-return.
 *
 * Before this module the handoff feature was half-built. The prompt told the
 * AI to "Escalate IMMEDIATELY and offer human connection" (see wpm_prompt.ts),
 * so customers were promised a human — but nothing in the backend ever set
 * wpm_conversations.status, nothing ever wrote wpm_handoff_events, and nobody
 * was notified. The only writer of 'handoff' was the Inbox toggle, and once a
 * conversation landed there the AI was skipped forever with no timeout, which
 * silently ghosted the customer.
 *
 * Escalation now fires two ways:
 *   1. Deterministic — an emergency keyword appears in the inbound message.
 *      Runs server-side, so it cannot be missed by a model that ignored its
 *      instructions. This is the path that must never fail.
 *   2. Model-signalled — the AI appends HANDOFF_SENTINEL for the judgment
 *      calls that free-text handoff_rules describe ("escalate angry
 *      customers"). Stripped before the text ever reaches the customer.
 */

/** Appended by the AI to request a handoff. Never shown to the customer. */
export const HANDOFF_SENTINEL = '[[HANDOFF]]';

/** Minutes of human silence after which the next inbound returns the bot. */
export const HANDOFF_IDLE_MINUTES = 30;

interface SupabaseLike {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
}

/**
 * Remove the handoff sentinel from an AI reply.
 *
 * Matched case-insensitively and anywhere in the text, because models place it
 * inconsistently despite instructions. Returns the customer-safe content.
 */
export function stripHandoffSignal(reply: string): { content: string; requested: boolean } {
  const pattern = /\[\[\s*HANDOFF\s*\]\]/gi;
  if (!pattern.test(reply)) return { content: reply, requested: false };
  const content = reply.replace(pattern, '').replace(/\s{2,}/g, ' ').trim();
  return { content, requested: true };
}

/**
 * Deterministic escalation check against the bot's emergency keywords.
 * Returns the keyword that matched, or null.
 *
 * Word-boundary matched so "refund" does not fire on "refundable", but
 * multi-word keywords ("legal action") still match as phrases.
 */
export function matchEmergencyKeyword(
  text: string | null | undefined,
  keywords: string[] | null | undefined,
): string | null {
  if (!text?.trim() || !keywords?.length) return null;
  const haystack = text.toLowerCase();
  for (const rawKeyword of keywords) {
    const keyword = rawKeyword?.trim().toLowerCase();
    if (!keyword) continue;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(haystack)) {
      return rawKeyword.trim();
    }
  }
  return null;
}

export type HandoffDecision =
  /** Let the AI answer this message. */
  | { action: 'reply'; returnToBot: boolean; reason?: string }
  /** A person owns this conversation right now — stay quiet. */
  | { action: 'stay_quiet' };

/**
 * Decide what to do with an inbound message on a conversation in handoff.
 *
 * The rules differ by how the handoff started, because the intent differs:
 *
 *   manual — someone hit "Take over" in the Inbox. They meant "stop replying",
 *            so the bot goes quiet immediately and only resumes after
 *            HANDOFF_IDLE_MINUTES of silence from that person.
 *
 *   auto   — the AI or an emergency keyword escalated. The team has been
 *            notified, but nobody has actually picked it up yet. Going silent
 *            here would punish the customer for asking a good question, so the
 *            bot keeps helping until a human actually sends a message.
 *
 * Either way a conversation can never be trapped: silence always expires.
 */
export async function decideHandoffAction(
  supabase: SupabaseLike,
  conversationId: string,
  idleMinutes: number = HANDOFF_IDLE_MINUTES,
): Promise<HandoffDecision> {
  try {
    const { data: conversation } = await supabase
      .from('wpm_conversations')
      .select('metadata')
      .eq('id', conversationId)
      .maybeSingle();

    const metadata = (conversation as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    const handoffAt = typeof metadata.handoff_at === 'string' ? metadata.handoff_at : null;
    const source = metadata.handoff_source === 'manual' ? 'manual' : 'auto';

    const { data: lastHuman } = await supabase
      .from('wpm_messages')
      .select('created_at')
      .eq('conversation_id', conversationId)
      .eq('role', 'human')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastHumanAt = (lastHuman as { created_at?: string } | null)?.created_at ?? null;

    // Auto-escalated and no person has stepped in yet: keep helping.
    if (source === 'auto') {
      const humanEngaged =
        lastHumanAt !== null &&
        (handoffAt === null || new Date(lastHumanAt).getTime() >= new Date(handoffAt).getTime());
      if (!humanEngaged) {
        return { action: 'reply', returnToBot: false, reason: 'escalated but unattended' };
      }
    }

    // A person owns it. Stay quiet until they have been silent long enough.
    const since = lastHumanAt ?? handoffAt;
    if (!since) {
      // Pre-dates handoff tracking — exactly the stuck conversations this releases.
      return { action: 'reply', returnToBot: true, reason: 'no handoff timestamp' };
    }

    const idleMs = Date.now() - new Date(since).getTime();
    if (idleMs >= idleMinutes * 60_000) {
      return { action: 'reply', returnToBot: true, reason: `no human reply for ${idleMinutes} minutes` };
    }

    return { action: 'stay_quiet' };
  } catch {
    // Never trap a customer because of a lookup failure.
    return { action: 'reply', returnToBot: true, reason: 'handoff lookup failed' };
  }
}

/** Move a conversation to human handoff and record why. */
export async function openHandoff(
  supabase: SupabaseLike,
  args: {
    clientId: string;
    conversationId: string;
    reason: string;
    priority?: 'normal' | 'urgent';
    /** 'auto' keeps the bot helping until a person steps in. See decideHandoffAction. */
    source?: 'auto' | 'manual';
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const now = new Date().toISOString();
  try {
    const { data: conversation } = await supabase
      .from('wpm_conversations')
      .select('metadata')
      .eq('id', args.conversationId)
      .maybeSingle();

    const existing = (conversation as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};

    await supabase
      .from('wpm_conversations')
      .update({
        status: 'handoff',
        metadata: { ...existing, handoff_at: now, handoff_source: args.source ?? 'auto' },
      })
      .eq('id', args.conversationId);

    await supabase.from('wpm_handoff_events').insert({
      client_id: args.clientId,
      conversation_id: args.conversationId,
      reason: args.reason,
      priority: args.priority ?? 'normal',
      status: 'open',
      metadata: args.metadata ?? {},
    });
  } catch (err) {
    console.error('[handoff] openHandoff failed:', err);
  }
}

/** Return a conversation to the bot and close any open handoff events. */
export async function closeHandoff(
  supabase: SupabaseLike,
  args: { clientId: string; conversationId: string; reason: string },
): Promise<void> {
  const now = new Date().toISOString();
  try {
    const { data: conversation } = await supabase
      .from('wpm_conversations')
      .select('metadata')
      .eq('id', args.conversationId)
      .maybeSingle();

    const existing = (conversation as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    delete existing.handoff_at;
    delete existing.handoff_source;

    await supabase
      .from('wpm_conversations')
      .update({ status: 'active', metadata: { ...existing, returned_to_bot_at: now } })
      .eq('id', args.conversationId);

    await supabase
      .from('wpm_handoff_events')
      .update({ status: 'resolved', updated_at: now })
      .eq('conversation_id', args.conversationId)
      .eq('status', 'open');
  } catch (err) {
    console.error('[handoff] closeHandoff failed:', err);
  }
}
