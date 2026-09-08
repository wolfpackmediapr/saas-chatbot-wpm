-- Bill only conversations the customer actually joined.
--
-- Found 2026-09-07. Publimedia shared one Instagram post with 69 accounts in 21
-- seconds. Every send came back as an echo, each echo opened a conversation, and
-- `conversations_used` for the month went from 8 to 77 -- without a single
-- customer having written a word. Nobody replied, no model call was made, and no
-- OpenAI token was spent.
--
-- On WolfPack's own comped agency account that cost nothing. On a paying plan it
-- is the meter: free 100/mo, starter 500, growth 2,500. The same blast would have
-- consumed 69% of a Free month or 14% of Starter, and on the free grant its 69
-- echoes would have eaten 69 of the 1,000 lifetime messages. A press release is
-- not 69 conversations.
--
-- The rule this migration installs: a conversation counts against an allowance
-- once the customer has said something in it. Until then it is outbound
-- broadcast, and broadcast is not what these meters price.
--
-- ⚠️ This does NOT reverse the 2026-08-21 decision that free accounts are metered
-- on every message including human Inbox replies. A human reply inside a thread a
-- customer started still counts, exactly as before. What stops counting is a
-- thread the customer never joined. See `_shared/wpm_usage.ts` for that policy.
--
-- The rule is self-correcting: the moment a recipient answers, the conversation
-- becomes billable and every message in it -- including the original outbound --
-- counts from then on. Nothing has to be backfilled or forgiven by hand.
--
-- `messages_in` / `messages_out` are deliberately left counting ALL traffic. They
-- are descriptive activity stats, not gates; an operator who sent a blast should
-- still see it. Only the two numbers that actually gate the bot change here.
--
-- CREATE OR REPLACE, not DROP + CREATE: replacing preserves the function's ACL,
-- so this cannot re-open the anon hole that DROP + CREATE opened on 2026-08-25.
-- The explicit revoke/grant below is belt-and-braces for a fresh-database replay,
-- where an earlier migration creates the function and Postgres grants EXECUTE to
-- PUBLIC by default.

create or replace function public.get_wpm_usage(p_user_id uuid)
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
  v_trial_days constant integer := 7;
begin
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
  -- A conversation the customer has spoken in at least once. This is the unit
  -- both allowances are meant to price; an outbound-only thread is a broadcast
  -- recipient, not a conversation.
  billable as (
    select c.id
    from public.wpm_conversations c
    where c.client_id in (select id from owned)
      and exists (
        select 1
        from public.wpm_messages m
        where m.conversation_id = c.id
          and m.direction in ('in', 'inbound')
      )
  ),
  monthly as (
    select
      count(distinct c.id) filter (
        where c.id in (select id from billable)
      )::integer as conversations_used,
      -- Descriptive, not a gate: count everything that moved this month.
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
      and m.conversation_id in (select id from billable)
  ),
  trial as (
    -- Already inbound-only, and for the same reason: a signup that only ever
    -- sends outbound must not start anyone's 7-day clock.
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
        else null
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

revoke execute on function public.get_wpm_usage(uuid) from public, anon;
grant execute on function public.get_wpm_usage(uuid) to authenticated, service_role;
