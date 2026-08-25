import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import { getUsageSummary, type UsageSummary } from '../lib/supabase/wpmClients';

/**
 * Warns the business before — and when — its agent stops replying.
 *
 * Until now nothing told the owner. The agent simply went quiet: the customer
 * got a handoff notice, `wpm_webhook_events` recorded the block, and the only
 * place the number appeared was Settings → Subscription, which nobody opens
 * unprompted. The 2026-08-20 incident was six days of silence discovered by
 * accident, and a spent allowance produces exactly the same symptom.
 *
 * Two thresholds, because they need different words:
 *   80%  — still replying. A heads-up, and dismissible.
 *   100% — has stopped replying. Not dismissible; dismissing it would hide the
 *          one fact the owner most needs to know.
 */

const WARN_AT = 0.8;

/** Dismissals are per threshold, so clearing the 80% notice cannot hide the 100% one. */
const DISMISS_KEY = 'wpm_usage_banner_dismissed_at_80';

export default function UsageBanner() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === '1',
  );

  useEffect(() => {
    getUsageSummary().then(setUsage).catch(() => {});
  }, []);

  if (!usage) return null;

  const onFreeGrant = usage.free_messages_limit !== null;
  const used = onFreeGrant ? usage.messages_lifetime : usage.conversations_used;
  const limit = onFreeGrant ? usage.free_messages_limit : usage.max_conversations;

  // Unlimited plans (agency, super admin) have no meter to warn about.
  if (limit === null) return null;

  // When the 7-day trial is what ran out, TrialBar already says so in the right
  // words. This banner would claim the MESSAGE allowance was spent, which may
  // be untrue — a trial can expire with most of the 1,000 unused.
  if (usage.free_trial_expired) return null;

  const ratio = used / limit;
  if (ratio < WARN_AT) return null;

  const exhausted = !usage.within_allowance;
  if (!exhausted && dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  const unit = onFreeGrant ? 'free messages' : 'conversations';

  return (
    <div
      role="status"
      className={
        'px-4 py-2.5 border-b flex items-start gap-3 text-sm ' +
        (exhausted
          ? 'bg-red-500/10 border-red-500/30 text-red-200'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-100')
      }
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        {exhausted ? (
          <>
            <strong>Your agent has stopped replying.</strong> You've used all{' '}
            {limit.toLocaleString()} {unit}
            {onFreeGrant && ' — the free trial is one-time and does not reset'}. New
            customer messages are still arriving in your Inbox, and they're getting a
            note saying someone will follow up.
          </>
        ) : (
          <>
            <strong>
              {used.toLocaleString()} of {limit.toLocaleString()} {unit} used.
            </strong>{' '}
            Your agent stops replying automatically when you reach the limit.
          </>
        )}{' '}
        <Link
          to="/dashboard/settings?tab=billing"
          className="underline font-medium whitespace-nowrap"
        >
          {exhausted ? 'Choose a plan' : 'See plans'}
        </Link>
      </div>
      {!exhausted && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="p-1 rounded hover:bg-white/10 flex-shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
