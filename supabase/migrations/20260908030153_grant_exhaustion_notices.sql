-- The trial's other ending.
--
-- Added 2026-09-07, completing the work started the same day. The plan is
-- "1,000 messages OR 7 days, whichever comes first" and only the calendar half
-- said anything. Someone who burns the grant on day three has their agent go
-- quiet with four days still on the clock and is told nothing at all.
--
-- Two more notices, both about the ALLOWANCE rather than the clock:
--   grant_low        90% of the grant used, calendar still running
--   grant_exhausted  grant spent, calendar still running
--
-- ⚠️ These must never say "your trial has ended", because it has not. Saying so
-- to someone with four days left is false and invites the reply "no it isn't".
-- That is the whole reason they are separate templates rather than the expiry
-- notice reworded.

alter table public.wpm_trial_notifications
  drop constraint if exists wpm_trial_notifications_kind_check;

alter table public.wpm_trial_notifications
  add constraint wpm_trial_notifications_kind_check
  check (kind in ('expiring_soon', 'expired', 'grant_low', 'grant_exhausted'));

-- The dedupe key is unchanged: (user_id, kind, trial_ends_at). A grant notice is
-- still scoped to one trial cycle, so `trial_ends_at` remains the right third
-- column and no schema change is needed beyond widening the CHECK.

-- ⚠️ DROP is required, not optional: this adds `messages_used` and
-- `messages_limit` to the return type, and `CREATE OR REPLACE` cannot change an
-- existing function's return type ("cannot change return type of existing
-- function"). Caught by the pglite replay suite before it reached production.
--
-- DROP loses the ACL and Postgres grants EXECUTE to PUBLIC on the new function,
-- which is the 2026-08-25 anon-hole mechanism exactly. The explicit revoke/grant
-- at the bottom of this file is therefore load-bearing, not decoration.
drop function if exists public.wpm_trial_notifications_due();

create function public.wpm_trial_notifications_due()
returns table(
  user_id        uuid,
  email          text,
  kind           text,
  trial_ends_at  timestamptz,
  business_name  text,
  messages_used  integer,
  messages_limit integer
)
language sql
stable
security definer
set search_path to ''
as $$
  with candidates as (
    select
      u.id as user_id,
      u.email::text as email,
      g.free_trial_ends_at,
      g.free_trial_expired,
      g.free_messages_limit,
      g.free_trial_started_at,
      g.messages_lifetime
    from auth.users u
    cross join lateral public.get_wpm_usage(u.id) g
    where u.deleted_at is null
  ),
  classified as (
    select
      c.user_id,
      c.email,
      c.free_trial_ends_at as trial_ends_at,
      c.messages_lifetime,
      c.free_messages_limit,
      -- ── Priority order, and it is load-bearing ────────────────────────────
      -- A single sweep sends at most ONE notice per account, so these must be
      -- ordered by which fact is actually true rather than by which is checked
      -- first. Two rules:
      --   * The calendar expiring outranks everything: the trial really is over
      --     and that is the simpler, truer story regardless of the grant.
      --   * Grant exhaustion outranks the calendar WARNING: if the allowance is
      --     already spent the agent has stopped, so telling someone their trial
      --     "ends tomorrow" would describe a future that has already arrived.
      -- Different kinds are separate ledger rows, so an account can still get
      -- grant_low today and expiring_soon days later. That is intended.
      case
        when c.free_trial_expired then 'expired'
        when c.messages_lifetime >= c.free_messages_limit then 'grant_exhausted'
        when c.free_trial_ends_at <= now() + interval '24 hours' then 'expiring_soon'
        when c.messages_lifetime >= (c.free_messages_limit * 0.9)::integer then 'grant_low'
      end as kind
    from candidates c
    where c.free_messages_limit is not null   -- on the free grant: not paid, not admin
      and c.free_trial_started_at is not null -- clock actually started
      and c.free_trial_ends_at is not null
  )
  select
    cl.user_id,
    cl.email,
    cl.kind,
    cl.trial_ends_at,
    (
      select w.name from public.wpm_clients w
      where w.owner_user_id = cl.user_id
      order by w.created_at
      limit 1
    )::text as business_name,
    cl.messages_lifetime as messages_used,
    cl.free_messages_limit as messages_limit
  from classified cl
  where cl.kind is not null
    and cl.email is not null
    and not exists (
      select 1 from public.wpm_trial_notifications n
      where n.user_id = cl.user_id
        and n.kind = cl.kind
        and n.trial_ends_at = cl.trial_ends_at
    );
$$;

revoke all on function public.wpm_trial_notifications_due() from public, anon, authenticated;
grant execute on function public.wpm_trial_notifications_due() to service_role;

comment on function public.wpm_trial_notifications_due() is
  'Accounts owed a trial notice right now, one per account per sweep, priority: expired > grant_exhausted > expiring_soon > grant_low. Service role only.';
