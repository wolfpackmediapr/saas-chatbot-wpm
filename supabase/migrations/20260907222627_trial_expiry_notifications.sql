-- Tell people their trial is ending.
--
-- Added 2026-09-07. Every other moment that matters sends an email: an
-- escalation, a qualified lead, an account deletion. Trial expiry sent nothing.
-- The agent simply went quiet and the only thing that said so was a banner
-- inside an app the customer had, by definition, stopped opening.
--
-- Two notices: one about 24 hours before the 7-day clock runs out, one after it
-- has. Both link to billing.
--
-- ⚠️ SCOPE: this is the CALENDAR half of the free trial only. The grant can also
-- run out at 1,000 messages, which deserves its own notice and its own wording —
-- "your trial expired" would be a lie to someone who still has four days left.
-- `wpm_trial_notifications.kind` is a text column with a CHECK precisely so that
-- case can be added as a third kind without a table rewrite.

create table if not exists public.wpm_trial_notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('expiring_soon', 'expired')),
  -- Part of the key on purpose. The clock starts at the first inbound customer
  -- message, so a genuinely new trial cycle has a different end date and is
  -- allowed to notify again; the SAME cycle can never notify twice.
  trial_ends_at timestamptz not null,
  email         text,
  sent_at       timestamptz not null default now(),
  unique (user_id, kind, trial_ends_at)
);

comment on table public.wpm_trial_notifications is
  'One row per trial notice actually sent. The unique key is the only thing preventing a duplicate email, so never drop it.';

alter table public.wpm_trial_notifications enable row level security;

-- Owners may read their own notice history; nobody but the service role writes.
-- Without an explicit policy RLS denies everything, which would also hide a
-- customer's own record from a future "we emailed you on..." surface.
create policy wpm_trial_notifications_owner_select
  on public.wpm_trial_notifications
  for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_super_admin()));

revoke all on table public.wpm_trial_notifications from anon;

-- ── Who is due a notice ─────────────────────────────────────────────────────
--
-- Deliberately calls get_wpm_usage rather than re-deriving the trial maths. That
-- function is the single source of truth for what a trial is and when it ends,
-- and a second copy of the rule would drift from it silently — exactly the class
-- of bug that had messages_in reading zero for months.
--
-- It is a lateral call per user, which is fine hourly at this size. If the user
-- table ever grows past a few thousand, narrow the candidate set BEFORE the
-- lateral rather than making the cron less frequent.
create or replace function public.wpm_trial_notifications_due()
returns table(
  user_id       uuid,
  email         text,
  kind          text,
  trial_ends_at timestamptz,
  business_name text
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
      g.free_trial_started_at
    from auth.users u
    cross join lateral public.get_wpm_usage(u.id) g
    where u.deleted_at is null
  ),
  classified as (
    select
      c.user_id,
      c.email,
      c.free_trial_ends_at as trial_ends_at,
      case
        -- Expired wins. If we somehow missed the 24-hour window, warning
        -- someone about something that has already happened is worse than
        -- skipping the warning.
        when c.free_trial_expired then 'expired'
        when c.free_trial_ends_at <= now() + interval '24 hours' then 'expiring_soon'
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
    )::text as business_name
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
  'Accounts owed a trial notice right now. Service role only; read by wpm-actions-processor.';

-- ── The schedule ────────────────────────────────────────────────────────────
--
-- Same proven shape as drain_lead_webhooks: secrets stay in Vault, never in
-- cron.job's plaintext command. Reuses the SAME two Vault entries and the SAME
-- edge function, so this adds no new secret to manage.
create or replace function public.drain_trial_notifications()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_secret text;
  v_url text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'wpm_action_processor_secret';

  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'wpm_functions_base_url';

  if v_secret is null or v_url is null then
    raise warning 'drain_trial_notifications: vault secrets missing, skipping';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/wpm-actions-processor',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-wpm-action-secret', v_secret),
    body    := jsonb_build_object('tasks', jsonb_build_array('trial_notifications')),
    timeout_milliseconds := 20000
  );
end;
$$;

revoke all on function public.drain_trial_notifications() from public, anon, authenticated;

comment on function public.drain_trial_notifications() is
  'Scheduled trial-notice sweep. Called by cron only; not part of the API surface.';

-- Hourly. A 7-day trial does not need minute precision, and the notice says
-- "tomorrow" rather than a countdown so an hour of slack cannot make it wrong.
-- cron.schedule upserts by jobname, so re-running this is safe.
select cron.schedule(
  'drain-trial-notifications',
  '7 * * * *',
  $$select public.drain_trial_notifications();$$
);
