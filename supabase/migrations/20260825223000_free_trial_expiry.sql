-- Free grant becomes a TRIAL: 1,000 messages OR 7 days, whichever comes first.
--
-- The clock starts at the FIRST INBOUND CUSTOMER MESSAGE, not at signup
-- (Wilf, 2026-08-25). A signup that never connects a channel burns nothing, so
-- nobody loses trial days to setup friction or a weekend. Until that first
-- message arrives the trial has not started and `free_trial_started_at` is
-- null.
--
-- Only free accounts are affected: `free_messages_limit` is already null for
-- paid and admin accounts, and every trial column is null/false for them too,
-- so the dashboard can branch on a single null check. Both existing accounts
-- are comped `agency`, so this ships with no live effect.
--
-- A spent or expired grant NEVER resets — the agent goes permanently quiet
-- until the business subscribes. That is why UsageBanner warns on days
-- remaining as well as messages: the first thing a customer must not learn
-- from silence is that their bot stopped answering.
--
-- The return type gains columns, which CREATE OR REPLACE cannot do, so the
-- function is dropped and recreated. DROP takes its grants with it — they are
-- re-granted below, exactly as captured from production beforehand
-- (authenticated, postgres, service_role). Both statements run in one
-- migration transaction, so there is no window where the function is missing.

drop function if exists public.get_wpm_usage(uuid);

create function public.get_wpm_usage(p_user_id uuid)
returns table(
  conversations_used integer,
  max_conversations integer,
  messages_in integer,
  messages_out integer,
  tokens_used bigint,
  period_start timestamp with time zone,
  messages_lifetime integer,
  free_messages_limit integer,
  free_trial_started_at timestamp with time zone,
  free_trial_ends_at timestamp with time zone,
  free_trial_expired boolean,
  within_allowance boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  -- 1,000 messages *or* this many days, whichever comes first.
  v_trial_days constant integer := 7;
begin
  -- Unchanged guard: the webhook calls this via service_role for an arbitrary
  -- owner, so auth.uid() IS NULL must fall through. anon has no EXECUTE.
  if auth.uid() is not null
     and auth.uid() <> p_user_id
     and not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  with plan as (
    select coalesce(
      (select case when s.status in ('active', 'trialing') then s.plan else 'free' end
       from public.subscriptions s where s.user_id = p_user_id limit 1),
      'free'
    ) as name,
    exists (select 1 from public.app_admins a where a.user_id = p_user_id) as is_admin
  ),
  owned as (
    select id from public.wpm_clients where owner_user_id = p_user_id
  ),
  monthly as (
    select
      count(distinct c.id)::integer as conversations_used,
      -- The pipeline writes 'inbound'/'outbound'; the previous version filtered
      -- 'in'/'out', which matches nothing, so these reported 0 for every account
      -- since they were added (verified: 367 messages returned 0/0). Accept both
      -- spellings so mixed historical data cannot reintroduce it.
      count(distinct m.id) filter (where m.direction in ('in', 'inbound'))::integer as messages_in,
      count(distinct m.id) filter (where m.direction in ('out', 'outbound'))::integer as messages_out,
      coalesce(sum((m.token_usage->>'total_tokens')::bigint), 0)::bigint as tokens_used
    from public.wpm_conversations c
    left join public.wpm_messages m on m.conversation_id = c.id
    where c.client_id in (select id from owned)
      and c.created_at >= date_trunc('month', now())
  ),
  lifetime as (
    select count(*)::integer as messages_lifetime
    from public.wpm_messages m
    where m.client_id in (select id from owned)
  ),
  -- Null until a real customer writes in. Deliberately counts inbound only:
  -- the business's own outbound traffic must not start its own trial clock.
  trial as (
    select (
      select min(m.created_at)
      from public.wpm_messages m
      where m.client_id in (select id from owned)
        and m.direction in ('in', 'inbound')
    ) as started_at
  ),
  caps as (
    select
      p.is_admin,
      p.name,
      case
        when p.is_admin or p.name = 'agency' then null
        when p.name = 'pro'     then 10000
        when p.name = 'growth'  then 2500
        when p.name = 'starter' then 500
        else null  -- free is metered by the lifetime grant, not by conversations
      end::integer as max_conversations,
      case
        when p.is_admin or p.name <> 'free' then null
        else 1000
      end::integer as free_messages_limit
    from plan p
  )
  select
    mo.conversations_used,
    ca.max_conversations,
    mo.messages_in,
    mo.messages_out,
    mo.tokens_used,
    date_trunc('month', now())::timestamptz as period_start,
    li.messages_lifetime,
    ca.free_messages_limit,
    -- Trial columns are null for anyone not on the free grant, so the UI can
    -- branch on a single null check rather than knowing the plan names.
    case when ca.free_messages_limit is null then null else tr.started_at end
      as free_trial_started_at,
    case
      when ca.free_messages_limit is null or tr.started_at is null then null
      else tr.started_at + make_interval(days => v_trial_days)
    end as free_trial_ends_at,
    case
      when ca.free_messages_limit is null or tr.started_at is null then false
      else now() >= tr.started_at + make_interval(days => v_trial_days)
    end as free_trial_expired,
    case
      when ca.free_messages_limit is not null
        -- Whichever runs out first. An unstarted trial cannot expire.
        then li.messages_lifetime < ca.free_messages_limit
             and not (
               tr.started_at is not null
               and now() >= tr.started_at + make_interval(days => v_trial_days)
             )
      when ca.max_conversations is not null
        then mo.conversations_used <= ca.max_conversations
      else true
    end as within_allowance
  from monthly mo, lifetime li, caps ca, trial tr;
end;
$function$;

-- Restored exactly as captured from production before the drop. anon is
-- deliberately absent: it has no EXECUTE and must not gain any.
grant execute on function public.get_wpm_usage(uuid) to authenticated;
grant execute on function public.get_wpm_usage(uuid) to postgres;
grant execute on function public.get_wpm_usage(uuid) to service_role;
