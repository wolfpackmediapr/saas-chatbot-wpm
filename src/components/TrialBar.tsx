import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { getUsageSummary, trialDaysRemaining, type UsageSummary } from '../lib/supabase/wpmClients';

/**
 * A persistent, always-visible line telling a free account where its trial is.
 *
 * The free grant is 1,000 messages OR 7 days, whichever comes first. UsageBanner
 * only warns on the MESSAGE meter, so a trial that runs out of days with 200
 * messages used would give no warning at all — the first thing the owner would
 * know is that the agent went quiet. A spent grant never resets, so that silence
 * is permanent until they subscribe.
 *
 * Deliberately thin and undismissable rather than a warning box: this is
 * ambient status, not an alert, right up until it becomes one. It escalates by
 * colour instead of by shouting — neutral for most of the week, amber in the
 * last two days, red once it has expired.
 */

/** Below this many days left, the bar stops being merely informational. */
const URGENT_DAYS = 2;

export default function TrialBar() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);

  useEffect(() => {
    getUsageSummary().then(setUsage).catch(() => {});
  }, []);

  if (!usage) return null;

  // Not on the free grant at all (paid, agency, super admin) — nothing to say.
  if (usage.free_messages_limit === null) return null;

  const days = trialDaysRemaining(usage);

  // The trial has not started: they have signed up but no customer has written
  // in yet, so no day is being burned. Say so — it is reassuring, and it
  // explains why the countdown has not begun.
  if (days === null) {
    return (
      <div
        role="status"
        className="px-4 py-1.5 border-b border-secondary bg-secondary/30 text-xs flex items-center gap-2"
      >
        <Clock className="h-3.5 w-3.5 flex-shrink-0 text-secondary-foreground" />
        <span className="text-secondary-foreground">
          Free trial — your 7 days start when your first customer messages you.{' '}
          {usage.free_messages_limit.toLocaleString()} messages included.
        </span>
      </div>
    );
  }

  const expired = usage.free_trial_expired;
  const urgent = !expired && days <= URGENT_DAYS;

  return (
    <div
      role="status"
      className={
        'px-4 py-1.5 border-b text-xs flex items-center gap-2 ' +
        (expired
          ? 'bg-red-500/10 border-red-500/30 text-red-200'
          : urgent
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-100'
            : 'bg-secondary/30 border-secondary text-secondary-foreground')
      }
    >
      <Clock className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="flex-1 min-w-0">
        {expired ? (
          <>
            <strong>Your 7-day free trial has ended</strong> — your agent has stopped
            replying. Messages still arrive in your Inbox.
          </>
        ) : (
          <>
            Free trial — <strong>{days === 1 ? '1 day' : `${days} days`} left</strong>.
            Using {usage.messages_lifetime.toLocaleString()} of{' '}
            {usage.free_messages_limit.toLocaleString()} messages.
          </>
        )}
      </span>
      <Link
        to="/dashboard/settings?tab=billing"
        className="flex-shrink-0 underline underline-offset-2 hover:no-underline"
      >
        {expired ? 'Choose a plan' : 'Upgrade'}
      </Link>
    </div>
  );
}
