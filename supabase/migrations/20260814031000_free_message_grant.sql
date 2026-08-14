-- Replace the "7-day free trial" (advertised in six places, implemented
-- nowhere — checkout never set trial_period_days) with a one-time free message
-- grant that is actually enforced.
--
-- Why messages, and why lifetime:
--   * Measured over real traffic, a conversation averaged 18,264 tokens but the
--     median was 6,142 and the worst was 175,854 — a 29x spread. Metering the
--     free tier per *conversation* therefore prices an unbounded tail.
--   * The old free tier granted 100 conversations EVERY MONTH, forever, which
--     is enough to run a small business on permanently.
--   * A time-boxed trial punishes this product's onboarding specifically: you
--     cannot get value until a Meta Page or Instagram account is connected, and
--     a clock burns while the user is still doing that. A grant is only spent
--     when the agent actually runs.
--   * 1,000 messages ~= 51 conversations at the observed 19.3 messages each,
--     and reads far more generous than "50 conversations" for the same cost.
--
-- Paid plans are unchanged: monthly conversation caps, as sold on the pricing
-- page. Only the free allowance changes unit.

-- Return signature changes, so the old function has to go first.
drop function if exists public.get_wpm_usage(uuid);

create function public.get_wpm_usage(p_user_id uuid)
returns table(
  conversations_used integer,
  max_conversations integer,
  messages_in integer,
  messages_out integer,
  tokens_used bigint,
  period_start timestamp with time zone,
  -- New: the free grant is counted over all time, not per calendar month.
  messages_lifetime integer,
  free_messages_limit integer,
  within_allowance boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $$
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
      -- The pipeline writes 'inbound'/'outbound'; the previous version of this
      -- function filtered on 'in'/'out', which matches nothing. messages_in and
      -- messages_out had therefore reported 0 for every account since they were
      -- added (verified: an account with 367 messages returned 0/0). Both
      -- spellings are accepted so mixed historical data cannot reintroduce it.
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
    -- One field the webhook can trust: free accounts are bounded by the
    -- lifetime grant, paid accounts by the monthly conversation cap, admins
    -- and agency by nothing.
    case
      when ca.free_messages_limit is not null
        then li.messages_lifetime < ca.free_messages_limit
      when ca.max_conversations is not null
        then mo.conversations_used <= ca.max_conversations
      else true
    end as within_allowance
  from monthly mo, lifetime li, caps ca;
end;
$$;

comment on function public.get_wpm_usage(uuid) is
  'Usage + allowance for one account. Free accounts are metered by a one-time '
  '1,000-message lifetime grant (free_messages_limit); paid accounts by the '
  'monthly conversation cap. within_allowance collapses both into one check.';

revoke all on function public.get_wpm_usage(uuid) from public, anon;
grant execute on function public.get_wpm_usage(uuid) to authenticated;
