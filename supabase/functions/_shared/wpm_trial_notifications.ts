/**
 * Trial expiry notices.
 *
 * Added 2026-09-07. Two emails: one about 24 hours before the 7-day clock runs
 * out, one after it has. Which accounts are owed one is decided in SQL by
 * `wpm_trial_notifications_due()`, which calls `get_wpm_usage` so there is
 * exactly one definition of what a trial is.
 *
 * ── Why it claims before it sends ───────────────────────────────────────────
 *
 * The ordering here is the whole design, so do not "simplify" it:
 *
 *   1. INSERT the notification row first, with ON CONFLICT DO NOTHING.
 *   2. Only send if that insert actually claimed the row.
 *   3. If the send fails, DELETE the claim so the next sweep retries.
 *
 * Sending first and recording afterwards means any crash in between re-sends the
 * same email every hour forever. Recording first and never releasing means one
 * Resend hiccup silently costs a customer the only warning they were ever going
 * to get. Claiming makes the duplicate window one sweep wide and bounded, and it
 * makes a failure retry exactly once per hour instead of never.
 *
 * The unique index on (user_id, kind, trial_ends_at) is what makes step 1 atomic
 * across concurrent sweeps. Everything else here is best-effort by design; a
 * mail failure must never take down the processor.
 */

interface SupabaseLike {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
  // deno-lint-ignore no-explicit-any
  rpc(fn: string, args?: Record<string, unknown>): any;
}

export interface DueTrialNotification {
  user_id: string;
  email: string;
  kind: 'expiring_soon' | 'expired';
  trial_ends_at: string;
  business_name: string | null;
}

export interface TrialNotificationResult {
  ok: boolean;
  due: number;
  sent: number;
  skipped: number;
  failed: number;
  error: string | null;
  results: Array<{
    userId: string;
    kind: string;
    status: 'sent' | 'skipped' | 'failed';
    reason?: string;
  }>;
}

type Sender = (
  to: string,
  args: { businessName?: string | null; endsAt: Date },
) => Promise<{ sent: boolean; reason?: string }>;

export async function sendDueTrialNotifications(args: {
  supabase: SupabaseLike;
  sendExpiringSoon: Sender;
  sendExpired: Sender;
  /** Cap per sweep so one bad batch cannot run away. */
  limit?: number;
}): Promise<TrialNotificationResult> {
  const empty: TrialNotificationResult = {
    ok: true,
    due: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    error: null,
    results: [],
  };

  let due: DueTrialNotification[];
  try {
    const { data, error } = await args.supabase.rpc('wpm_trial_notifications_due');
    if (error) {
      console.error('[trial-notify] due lookup failed:', error);
      return { ...empty, ok: false, error: String((error as { message?: string }).message ?? error) };
    }
    due = (data ?? []) as DueTrialNotification[];
  } catch (err) {
    console.error('[trial-notify] due lookup threw:', err);
    return { ...empty, ok: false, error: String(err) };
  }

  const batch = due.slice(0, Math.max(args.limit ?? 50, 1));
  const result: TrialNotificationResult = { ...empty, due: due.length, results: [] };

  for (const row of batch) {
    // ── 1. Claim ────────────────────────────────────────────────────────────
    // `select()` after insert returns the inserted rows; with ON CONFLICT DO
    // NOTHING an already-claimed notice comes back empty, which is how a second
    // sweep (or a second instance) knows to leave it alone.
    let claimed = false;
    try {
      const { data, error } = await args.supabase
        .from('wpm_trial_notifications')
        .upsert(
          {
            user_id: row.user_id,
            kind: row.kind,
            trial_ends_at: row.trial_ends_at,
            email: row.email,
          },
          { onConflict: 'user_id,kind,trial_ends_at', ignoreDuplicates: true },
        )
        .select('id');

      if (error) {
        console.error(`[trial-notify] claim failed for ${row.user_id} ${row.kind}:`, error);
        result.failed += 1;
        result.results.push({ userId: row.user_id, kind: row.kind, status: 'failed', reason: 'claim failed' });
        continue;
      }
      claimed = Array.isArray(data) && data.length > 0;
    } catch (err) {
      console.error(`[trial-notify] claim threw for ${row.user_id} ${row.kind}:`, err);
      result.failed += 1;
      result.results.push({ userId: row.user_id, kind: row.kind, status: 'failed', reason: String(err) });
      continue;
    }

    if (!claimed) {
      // Someone else already has it. Not an error.
      result.skipped += 1;
      result.results.push({ userId: row.user_id, kind: row.kind, status: 'skipped', reason: 'already sent' });
      continue;
    }

    // ── 2. Send ─────────────────────────────────────────────────────────────
    const send = row.kind === 'expired' ? args.sendExpired : args.sendExpiringSoon;
    const outcome = await send(row.email, {
      businessName: row.business_name,
      endsAt: new Date(row.trial_ends_at),
    });

    if (outcome.sent) {
      result.sent += 1;
      result.results.push({ userId: row.user_id, kind: row.kind, status: 'sent' });
      console.log(`[trial-notify] sent ${row.kind} to ${row.user_id}`);
      continue;
    }

    // ── 3. Release ──────────────────────────────────────────────────────────
    // The claim is the only thing standing between this customer and never
    // hearing from us, so it must not outlive a failed send.
    try {
      await args.supabase
        .from('wpm_trial_notifications')
        .delete()
        .eq('user_id', row.user_id)
        .eq('kind', row.kind)
        .eq('trial_ends_at', row.trial_ends_at);
    } catch (err) {
      console.error(`[trial-notify] could not release claim for ${row.user_id} ${row.kind}:`, err);
    }

    result.failed += 1;
    result.results.push({
      userId: row.user_id,
      kind: row.kind,
      status: 'failed',
      reason: outcome.reason ?? 'send failed',
    });
    console.error(`[trial-notify] ${row.kind} to ${row.user_id} failed: ${outcome.reason ?? 'unknown'}`);
  }

  result.ok = result.failed === 0;
  return result;
}
