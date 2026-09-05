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

/**
 * Strip diacritics so "atención" and "atencion" match the same pattern.
 * Messenger and Instagram customers type both, constantly.
 */
function foldAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Asking for a human, in the words customers actually use.
 *
 * WHY THIS EXISTS. Until 2026-09-02 the ONLY deterministic escalation path was
 * the owner's own `emergency_keywords`, and the word "human" is not something
 * anyone thinks to type into a keyword box — Wolfpack's list was
 * ["lawsuit","data breach","refund"]. So every "can I talk to a human"
 * escalation depended entirely on the model choosing to append HANDOFF_SENTINEL,
 * which it does inconsistently. Measured on live traffic that day, with
 * identical configuration:
 *   14:35 "quisiera hablar ahora mismo con un humano"  → escalated
 *   23:29 "I want to talk to a human again."           → NOT escalated
 *   23:31 "Can I talk to a human?"                     → NOT escalated
 * Same intent, same config, nine hours apart. The prompt itself warns that
 * telling a customer a human is coming without the tag means "nobody is ever
 * notified" — which is exactly what happened, twice, to a real prospect.
 *
 * An explicit request for a human is the least ambiguous signal a customer can
 * send. It must not depend on the model's mood, and it must not depend on every
 * business guessing the right keyword.
 *
 * SHAPE, NOT VOCABULARY. EVERY pattern requires a request verb aimed at a
 * person-noun; none matches a bare noun. A first draft included a standalone
 * "real person" pattern and its own test caught it firing on "is this a real
 * person or AI?" — precisely the question hard rule 8 exists to answer. That is deliberate: hard
 * rule 8 tells the agent to answer truthfully when asked "are you a human?",
 * and a bare-word match would escalate that perfectly ordinary question. Same
 * lesson as the 2026-08-22 Spanish lead bug: prefer the structural signal.
 *
 * Cost of a false positive is low by design: this opens a handoff with
 * source 'auto', and decideHandoffAction keeps the bot replying while an auto
 * handoff is unattended. Nobody gets stranded; a teammate just gets an alert.
 */
export const ESCALATION_REQUEST_PATTERNS: readonly RegExp[] = [
  // EN — "talk/speak/chat/connect/transfer ... to/with ... a human/person/agent"
  /\b(?:talk|speak|chat|connect|transfer|forward)\w*\b[^.!?\n]{0,25}?\b(?:to|with)\b[^.!?\n]{0,20}?\b(?:human|person|people|agent|representative|rep|someone|somebody|advisor|operator)\b/,
  // EN — "I want / need / give me a real person", "get me an agent"
  /\b(?:want|need|get|give|put)\b[^.!?\n]{0,15}?\b(?:a|an|the)\s+(?:real\s+|live\s+|actual\s+|human\s+)?(?:human|person|agent|representative|rep|operator|advisor)\b/,
  // ES — "hablar/comunicar/contactar ... con ... humano/persona/agente/alguien"
  /\b(?:hablar|hablarle|comunicar|comunicarme|comunicarse|contactar|conversar|atienda|atiendan)\b[^.!?\n]{0,25}?\bcon\b[^.!?\n]{0,20}?\b(?:humano|humana|persona|agente|representante|alguien|asesor|operador)\b/,
  // ES — "quiero / necesito / quisiera / dame / paseme un humano | una persona"
  /\b(?:quiero|quisiera|necesito|deseo|dame|paseme|pasame|transfiereme|transfiera|comunicame)\b[^.!?\n]{0,20}?\b(?:un|una|el|la)\s+(?:humano|humana|persona(?:\s+real)?|agente|representante|asesor|operador)\b/,
];
/**
 * Did the customer explicitly ask to be handed to a person?
 *
 * Returns the matched phrase (for the audit trail) or null. Runs on the
 * INBOUND text only — never on our own reply, which routinely contains
 * "a team member will follow up" and would otherwise escalate every
 * lead-capture conversation. Same trap as the 2026-08-30 intent bug.
 */
export function matchEscalationRequest(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  const haystack = foldAccents(text.toLowerCase());
  for (const pattern of ESCALATION_REQUEST_PATTERNS) {
    const hit = pattern.exec(haystack);
    if (hit) return hit[0].trim();
  }
  return null;
}

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
      .or('metadata->>sent_via_graph_api.is.null,metadata->>sent_via_graph_api.neq.false')
      .or('metadata->>delivery.is.null,metadata->>delivery.neq.failed')
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
): Promise<{ opened: boolean }> {
  const now = new Date().toISOString();
  try {
    // An escalated conversation keeps being answered until a person steps in,
    // so the same conversation can re-trigger escalation on every message.
    // Without this, each one would add another handoff event, reset the
    // "waiting for" timer, and fire another alert for a handoff already raised.
    const { data: alreadyOpen, error: openError } = await supabase
      .from('wpm_handoff_events')
      .select('id')
      .eq('conversation_id', args.conversationId)
      .eq('status', 'open')
      .limit(1)
      .maybeSingle();

    if (openError) throw new Error(openError.message);
    if (alreadyOpen) return { opened: false };

    const { data: conversation } = await supabase
      .from('wpm_conversations')
      .select('metadata')
      .eq('id', args.conversationId)
      .maybeSingle();

    const existing = (conversation as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};

    const { error: updateError } = await supabase
      .from('wpm_conversations')
      .update({
        status: 'handoff',
        metadata: { ...existing, handoff_at: now, handoff_source: args.source ?? 'auto' },
      })
      .eq('id', args.conversationId);

    if (updateError) throw new Error(updateError.message);
    const { error: insertError } = await supabase.from('wpm_handoff_events').insert({
      client_id: args.clientId,
      conversation_id: args.conversationId,
      reason: args.reason,
      priority: args.priority ?? 'normal',
      status: 'open',
      metadata: args.metadata ?? {},
    });

    if (insertError) throw new Error(insertError.message);
    return { opened: true };
  } catch (err) {
    console.error('[handoff] openHandoff failed:', err);
    return { opened: false };
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
