-- A blocked reply tells the OWNER, never the customer.
--
-- Added 2026-09-15, decided by Wilf. Until now a blocked reply (trial expired,
-- free grant spent, paid plan over its monthly cap, or a thread over its 24h
-- reply cap) sent the customer "they'll get back to you shortly" — and told
-- nobody. It went to two real customers of In House Chef after his trial ended.
--
-- Now the customer is sent nothing, and the owner gets an email for the FIRST 3
-- conversations per client, per kind, per period. This table is the ledger that
-- enforces that cap, exactly as wpm_trial_notifications does for trial notices.
--
-- ⚠️ The two unique keys are the only thing standing between a busy expired page
-- and an email per message. Never drop either.

create table if not exists public.wpm_blocked_message_alerts (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.wpm_clients(id) on delete cascade,
  kind            text not null
                    check (kind in ('trial_expired', 'grant_exhausted', 'plan_limit', 'conversation_cap')),
  -- trial:<ends_at> · grant · month:YYYY-MM · day:YYYY-MM-DD — see
  -- blockedAlertPeriodKey() in _shared/wpm_blocked_alerts.ts.
  period_key      text not null,
  conversation_id uuid not null references public.wpm_conversations(id) on delete cascade,
  -- 1..N within the period. Unique, so two concurrent webhooks cannot both take slot 3.
  slot            smallint not null check (slot between 1 and 10),
  recipient       text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  unique (client_id, kind, period_key, slot),
  unique (client_id, kind, period_key, conversation_id)
);

comment on table public.wpm_blocked_message_alerts is
  'One row per owner alert about a reply the agent did not send. The unique keys cap it at 3 per period; never drop them.';

alter table public.wpm_blocked_message_alerts enable row level security;

-- Owners may read their own alert history; only the service role writes.
create policy wpm_blocked_message_alerts_owner_select
  on public.wpm_blocked_message_alerts
  for select
  to authenticated
  using (
    exists (
      select 1 from public.wpm_clients c
      where c.id = client_id and c.owner_user_id = (select auth.uid())
    )
    or (select public.is_super_admin())
  );

revoke all on table public.wpm_blocked_message_alerts from anon;

-- ── Claim a slot ────────────────────────────────────────────────────────────
--
-- Returns the slot claimed (1..p_max), or NULL when this conversation already
-- has an alert in the period or every slot is taken. ON CONFLICT DO NOTHING with
-- no target lets EITHER unique key reject the insert, which is what makes the
-- cap safe under concurrent webhook invocations without a lock.
--
-- SECURITY INVOKER on purpose: only service_role may execute it, and
-- service_role already bypasses RLS, so definer rights would add nothing but risk.
create or replace function public.claim_blocked_message_alert(
  p_client_id       uuid,
  p_kind            text,
  p_period_key      text,
  p_conversation_id uuid,
  p_max             integer default 3
)
returns integer
language plpgsql
set search_path to ''
as $$
declare
  v_slot integer;
begin
  if p_max is null or p_max < 1 then
    return null;
  end if;

  for s in 1..least(p_max, 10) loop
    insert into public.wpm_blocked_message_alerts
      (client_id, kind, period_key, conversation_id, slot)
    values
      (p_client_id, p_kind, p_period_key, p_conversation_id, s)
    on conflict do nothing
    returning slot into v_slot;

    if v_slot is not null then
      return v_slot;
    end if;

    -- The conflict may have been THIS conversation, not a taken slot. Stop
    -- rather than claim a second slot for a conversation already alerted.
    if exists (
      select 1 from public.wpm_blocked_message_alerts a
      where a.client_id = p_client_id
        and a.kind = p_kind
        and a.period_key = p_period_key
        and a.conversation_id = p_conversation_id
    ) then
      return null;
    end if;
  end loop;

  return null;
end;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default (the 2026-08-25 anon-hole
-- mechanism). These two lines are load-bearing, not decoration.
revoke all on function public.claim_blocked_message_alert(uuid, text, text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_blocked_message_alert(uuid, text, text, uuid, integer)
  to service_role;

comment on function public.claim_blocked_message_alert(uuid, text, text, uuid, integer) is
  'Claims an owner-alert slot for a blocked reply. Service role only; called by meta-direct-webhook.';
