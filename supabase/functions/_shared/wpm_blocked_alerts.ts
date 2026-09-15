/**
 * When the agent does not reply, tell the OWNER — never the customer.
 *
 * Added 2026-09-15, decided by Wilf. Until then a blocked reply sent the
 * customer "I'm handing this to a member of our team — they'll get back to you
 * shortly." That notice opened no handoff and emailed nobody, so the promise
 * was kept by no one. In production it went to two of In House Chef's
 * customers after his trial ended; one of them, @mariamorazzani, had already
 * been waiting thirteen days for a call. It also contradicted the expiry email,
 * which tells the owner the agent "has stopped replying", and it was English to
 * customers writing in Spanish.
 *
 * Now the customer is sent nothing, which also spends nothing: no Graph send,
 * no stored row, and no echo webhook coming back for our own message. Their
 * message is still stored before the allowance check, so it stays in the Inbox.
 *
 * ── Four kinds, four emails ─────────────────────────────────────────────────
 *
 * `AllowanceBlockReason` has three values, but `account_allowance` covers two
 * different situations with different truths to tell the owner:
 *
 *   trial_expired     the 7-day clock ran out           → billing, owner
 *   grant_exhausted   the 1,000 free messages ran out   → billing, owner
 *   plan_limit        a PAID plan's monthly cap         → billing, owner; resets next month
 *   conversation_cap  one thread hit its 24h reply cap  → operational, inbox contact
 *
 * Billing mail follows the account; operational mail follows the inbox — the
 * same split the trial notices and the escalation email already use.
 *
 * ── The cap: first 3 conversations per client, per kind, per period ────────
 *
 * A busy page on an expired account could otherwise email its owner on every
 * message. One alert per conversation, at most MAX_BLOCKED_ALERTS_PER_PERIOD per
 * period, then silence. A trial or grant period never resets; a plan limit
 * resets monthly; the reply cap daily.
 *
 * ── Claim before send, release on failure ──────────────────────────────────
 *
 * Identical reasoning to `wpm_trial_notifications.ts`, do not "simplify" it:
 * the claim (`claim_blocked_message_alert`, atomic on two unique keys) happens
 * first, the email only goes if the claim succeeded, and a failed send gives
 * the slot back so a later message can use it. The recipient lookups run only
 * AFTER a successful claim, so once the cap is reached a blocked message costs
 * exactly one RPC.
 *
 * Best-effort throughout: this function never throws, because it runs on the
 * live reply path.
 */

import {
  type BlockedAlertEmail,
  type BlockedAlertKind,
  resolveHandoffRecipient,
  sendBlockedMessageAlertEmail,
} from './wpm_email.ts';
import type { ConversationAllowance } from './wpm_usage.ts';

export type { BlockedAlertKind } from './wpm_email.ts';

interface SupabaseLike {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
  // deno-lint-ignore no-explicit-any
  rpc(fn: string, args?: Record<string, unknown>): any;
  auth?: {
    admin?: {
      getUserById(id: string): Promise<{
        data: { user: { email?: string | null } | null };
        error: unknown;
      }>;
    };
  };
}

export const MAX_BLOCKED_ALERTS_PER_PERIOD = 3;

const LEDGER = 'wpm_blocked_message_alerts';

export type BlockedAlertSender = (
  to: string,
  email: BlockedAlertEmail,
) => Promise<{ sent: boolean; reason?: string }>;

export interface BlockedAlertOutcome {
  status: 'sent' | 'skipped' | 'failed';
  kind: BlockedAlertKind | null;
  reason?: string;
  alertNumber?: number;
}

/** Which email a block deserves, or null when nothing was blocked. */
export function blockedAlertKind(allowance: ConversationAllowance): BlockedAlertKind | null {
  if (allowance.allowed) return null;
  switch (allowance.reason) {
    case 'trial_expired':
      return 'trial_expired';
    case 'conversation_cap':
      return 'conversation_cap';
    case 'account_allowance':
      return allowance.meter === 'free_grant' ? 'grant_exhausted' : 'plan_limit';
    default:
      return null;
  }
}

/**
 * The window the cap of 3 applies to. Part of the ledger's unique keys, so a
 * new period may alert again while the same period never exceeds the cap.
 */
export function blockedAlertPeriodKey(
  kind: BlockedAlertKind,
  allowance: ConversationAllowance,
  now: Date = new Date(),
): string {
  switch (kind) {
    case 'trial_expired':
      // A trial ends once; keyed by its end date like wpm_trial_notifications.
      return `trial:${allowance.trialEndsAt ?? 'unknown'}`;
    case 'grant_exhausted':
      // The free grant never resets.
      return 'grant';
    case 'plan_limit':
      // get_wpm_usage counts conversations from date_trunc('month', now()).
      return `month:${now.toISOString().slice(0, 7)}`;
    case 'conversation_cap':
      return `day:${now.toISOString().slice(0, 10)}`;
  }
}

async function defaultRecipient(
  supabase: SupabaseLike,
  kind: BlockedAlertKind,
  clientId: string,
  botProfileId: string | null,
  ownerUserId: string | null,
): Promise<string | null> {
  if (kind === 'conversation_cap') {
    return await resolveHandoffRecipient(supabase, clientId, botProfileId);
  }
  // Billing kinds go to the person who can enter a card, not the inbox contact.
  if (!ownerUserId || !supabase.auth?.admin) return null;
  const { data, error } = await supabase.auth.admin.getUserById(ownerUserId);
  const email = data?.user?.email?.trim();
  return !error && email?.includes('@') ? email : null;
}

export async function alertOwnerOfBlockedMessage(args: {
  supabase: SupabaseLike;
  allowance: ConversationAllowance;
  clientId: string;
  conversationId: string | null | undefined;
  botProfileId: string | null;
  customerName: string | null;
  channelLabel: string;
  lastMessage: string | null;
  now?: Date;
  /** Injected in tests; defaults to the real Resend sender. */
  send?: BlockedAlertSender;
  /** Injected in tests; defaults to owner (billing) or inbox contact (reply cap). */
  resolveRecipient?: (kind: BlockedAlertKind) => Promise<string | null>;
}): Promise<BlockedAlertOutcome> {
  const kind = blockedAlertKind(args.allowance);
  if (!kind) return { status: 'skipped', kind: null, reason: 'not blocked' };
  if (!args.conversationId) return { status: 'skipped', kind, reason: 'no conversation' };

  const periodKey = blockedAlertPeriodKey(kind, args.allowance, args.now);
  const key = { client_id: args.clientId, kind, period_key: periodKey };

  try {
    // ── 1. Claim ──────────────────────────────────────────────────────────
    const { data: slot, error: claimError } = await args.supabase.rpc('claim_blocked_message_alert', {
      p_client_id: args.clientId,
      p_kind: kind,
      p_period_key: periodKey,
      p_conversation_id: args.conversationId,
      p_max: MAX_BLOCKED_ALERTS_PER_PERIOD,
    });
    if (claimError) {
      console.error(`[blocked-alert] claim failed for ${args.clientId} ${kind}:`, claimError);
      return { status: 'failed', kind, reason: 'claim failed' };
    }
    if (typeof slot !== 'number') {
      // This conversation was already alerted, or the period's cap is spent.
      return { status: 'skipped', kind, reason: 'already alerted or cap reached' };
    }

    const release = async () => {
      try {
        await args.supabase
          .from(LEDGER)
          .delete()
          .eq('client_id', key.client_id)
          .eq('kind', key.kind)
          .eq('period_key', key.period_key)
          .eq('slot', slot);
      } catch (err) {
        console.error(`[blocked-alert] could not release slot ${slot} for ${args.clientId} ${kind}:`, err);
      }
    };

    // ── 2. Who, and what to say ──────────────────────────────────────────
    const { data: client } = await args.supabase
      .from('wpm_clients')
      .select('name, owner_user_id')
      .eq('id', args.clientId)
      .maybeSingle();
    const clientRow = client as { name?: string | null; owner_user_id?: string | null } | null;

    const to = args.resolveRecipient
      ? await args.resolveRecipient(kind)
      : await defaultRecipient(
        args.supabase,
        kind,
        args.clientId,
        args.botProfileId,
        clientRow?.owner_user_id ?? null,
      );
    if (!to) {
      await release();
      return { status: 'failed', kind, reason: 'no recipient' };
    }

    // ── 3. Send, or give the slot back ───────────────────────────────────
    const send = args.send ?? sendBlockedMessageAlertEmail;
    const outcome = await send(to, {
      kind,
      businessName: clientRow?.name ?? null,
      customerName: args.customerName,
      channelLabel: args.channelLabel,
      lastMessage: args.lastMessage,
      conversationId: args.conversationId,
      replyLimit: kind === 'conversation_cap' ? args.allowance.max : null,
      alertNumber: slot,
      alertLimit: MAX_BLOCKED_ALERTS_PER_PERIOD,
    });

    if (!outcome.sent) {
      await release();
      return { status: 'failed', kind, reason: outcome.reason ?? 'send failed' };
    }

    // The ledger outlives the logs — record where it went. Best-effort.
    try {
      await args.supabase
        .from(LEDGER)
        .update({ recipient: to, sent_at: new Date().toISOString() })
        .eq('client_id', key.client_id)
        .eq('kind', key.kind)
        .eq('period_key', key.period_key)
        .eq('slot', slot);
    } catch (err) {
      console.warn('[blocked-alert] sent, but could not record the recipient:', err);
    }

    return { status: 'sent', kind, alertNumber: slot };
  } catch (err) {
    console.error(`[blocked-alert] unexpected failure for ${args.clientId} ${kind}:`, err);
    return { status: 'failed', kind, reason: String(err) };
  }
}
