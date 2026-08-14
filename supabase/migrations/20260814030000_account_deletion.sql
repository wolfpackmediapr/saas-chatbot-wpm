-- Account deletion — honours the promise published at
-- https://wolfpackmediapr.com/data-deletion ("we delete your account and all
-- associated data within 30 days"). Until now nothing implemented it.
--
-- Deletion is immediate rather than queued for 30 days: strictly better than
-- what we promise, and it avoids a "pending deletion" state that every later
-- query would have to remember to exclude.
--
-- The function takes NO user argument and acts only on auth.uid(), so unlike
-- get_wpm_usage/get_plan_limits there is no p_user_id to guard and no
-- cross-tenant surface to get wrong.

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_client_ids uuid[];
  v_deleted jsonb := '{}'::jsonb;
  v_n bigint;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Super admins would take the whole agency's data with them, and the app
  -- offers them no way to re-grant themselves access afterwards.
  if exists (select 1 from public.app_admins a where a.user_id = v_user_id) then
    raise exception 'Super admin accounts cannot self-delete; remove the admin grant first'
      using errcode = '42501';
  end if;

  select coalesce(array_agg(c.id), '{}') into v_client_ids
  from public.wpm_clients c
  where c.owner_user_id = v_user_id;

  -- ── Webhook events FIRST ──────────────────────────────────────────────────
  -- wpm_webhook_events.client_id / conversation_id / channel_id are all ON
  -- DELETE SET NULL, not CASCADE. Deleting wpm_clients would therefore leave
  -- these rows behind with every FK nulled — and raw_payload holds the full
  -- Meta webhook body: customer message text and sender IDs. Orphaned that
  -- way they are unattributable and unreachable, which is the worst possible
  -- outcome for a deletion promise. They must go before the cascade runs.
  delete from public.wpm_webhook_events w
  where w.client_id = any(v_client_ids)
     or w.channel_id in (
          select ch.id from public.wpm_client_channels ch
          where ch.client_id = any(v_client_ids))
     or w.conversation_id in (
          select cv.id from public.wpm_conversations cv
          where cv.client_id = any(v_client_ids));
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('wpm_webhook_events', v_n);

  -- ── Tenant data ───────────────────────────────────────────────────────────
  -- Cascades to bot_profiles (→ bot_instructions), client_channels (and the
  -- Meta page access tokens on them), conversations (→ messages, handoff
  -- events), knowledge_sources, leads, integrations, tool_executions.
  delete from public.wpm_clients c where c.owner_user_id = v_user_id;
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('wpm_clients', v_n);

  -- ── Legacy assistant surface (ai_bots / chat_threads / chat_messages) ─────
  delete from public.chat_threads t where t.user_id = v_user_id;  -- cascades chat_messages
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('chat_threads', v_n);

  delete from public.ai_bots b where b.user_id = v_user_id;
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('ai_bots', v_n);

  -- ── Account-scoped rows ───────────────────────────────────────────────────
  delete from public.user_logs l where l.user_id = v_user_id;
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('user_logs', v_n);

  delete from public.user_settings s where s.user_id = v_user_id;
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('user_settings', v_n);

  -- The billing RECORDS we must keep for 7 years live in Stripe, not here.
  -- This row is only local subscription state (plan, status, customer id).
  delete from public.subscriptions sub where sub.user_id = v_user_id;
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('subscriptions', v_n);

  delete from public.profiles p where p.id = v_user_id;
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('profiles', v_n);

  -- auth.users is deliberately NOT deleted here. Removing the identity is the
  -- caller's final step via the admin API, because it must happen only after
  -- the Stripe subscription is cancelled — otherwise billing outlives the
  -- account. See the delete-account edge function.
  return jsonb_build_object(
    'user_id', v_user_id,
    'deleted_at', now(),
    'rows_deleted', v_deleted
  );
end;
$$;

comment on function public.delete_my_account() is
  'Deletes every row belonging to the calling user. Acts only on auth.uid(). '
  'Webhook events are removed first because their FKs are SET NULL, not CASCADE. '
  'Does not remove auth.users — the caller does that after cancelling Stripe.';

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
