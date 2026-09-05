-- All lead inserts share an owner lock: clients and parallel webhooks cannot
-- multiply Starter's 50-lead allowance. Existing leads remain readable/editable.
create or replace function public.enforce_wpm_lead_allowance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_plan text; v_count integer; v_allowed boolean;
begin
  select owner_user_id into v_owner from public.wpm_clients where id=new.client_id;
  if v_owner is null then raise exception 'Lead requires an owned business'; end if;
  if auth.uid() is not null and auth.uid()<>v_owner and not public.is_super_admin() then
    raise exception 'Business not owned by this account' using errcode='42501';
  end if;
  if new.conversation_id is not null and not exists(select 1 from public.wpm_conversations
    where id=new.conversation_id and client_id=new.client_id) then
    raise exception 'Conversation does not belong to business' using errcode='42501';
  end if;
  -- The allowance uses capture time, not a caller-supplied/backdated value.
  new.created_at:=now();
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));
  if exists(select 1 from public.app_admins where user_id=v_owner) then return new; end if;
  select coalesce((select plan from public.subscriptions where user_id=v_owner
    and status in ('active','trialing') limit 1),'free') into v_plan;
  if v_plan='free' then
    select within_allowance into v_allowed from public.get_wpm_usage(v_owner);
    if v_allowed is distinct from true then
      raise exception 'LEAD_TRIAL_EXHAUSTED' using errcode='P0001';
    end if;
  elsif v_plan='starter' then
    select count(*) into v_count from public.wpm_leads l
      join public.wpm_clients c on c.id=l.client_id
      where c.owner_user_id=v_owner and l.created_at>=date_trunc('month',now());
    if v_count>=50 then raise exception 'LEAD_MONTHLY_LIMIT' using errcode='P0001'; end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_wpm_lead_allowance() from public,anon,authenticated;
create trigger enforce_wpm_lead_allowance before insert on public.wpm_leads
for each row execute function public.enforce_wpm_lead_allowance();

-- Only trusted edge functions can capture/queue leads. Never accept a
-- conversation from another tenant, even with a service-role caller.
create or replace function public.capture_wpm_lead(p_client_id uuid,p_conversation_id uuid,p_lead jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_owner uuid; v_id uuid;
begin
  select c.owner_user_id into v_owner from public.wpm_clients c
    join public.wpm_conversations cv on cv.client_id=c.id
    where c.id=p_client_id and cv.id=p_conversation_id;
  if v_owner is null then raise exception 'Conversation does not belong to business' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text,0));
  select id into v_id from public.wpm_leads
    where client_id=p_client_id and conversation_id=p_conversation_id
    order by created_at desc limit 1;
  if v_id is not null then
    update public.wpm_leads set
      full_name=coalesce(nullif(p_lead->>'full_name',''),full_name),
      email=coalesce(nullif(p_lead->>'email',''),email),
      phone=coalesce(nullif(p_lead->>'phone',''),phone),
      service_interest=coalesce(nullif(p_lead->>'service_interest',''),service_interest),
      intent=coalesce(nullif(p_lead->>'intent',''),intent),
      qualification_data=coalesce(qualification_data,'{}'::jsonb)||coalesce(p_lead->'qualification_data','{}'::jsonb),
      last_contact_at=now(),updated_at=now()
      where id=v_id;
    return jsonb_build_object('id',v_id,'created',false);
  end if;
  insert into public.wpm_leads(client_id,conversation_id,full_name,email,phone,
    service_interest,intent,qualification_data,source_channel,status,last_contact_at)
  values(p_client_id,p_conversation_id,p_lead->>'full_name',p_lead->>'email',p_lead->>'phone',
    p_lead->>'service_interest',p_lead->>'intent',coalesce(p_lead->'qualification_data','{}'::jsonb),
    p_lead->>'source_channel','qualified',now()) returning id into v_id;
  return jsonb_build_object('id',v_id,'created',true);
end;
$$;
revoke execute on function public.capture_wpm_lead(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.capture_wpm_lead(uuid,uuid,jsonb) to service_role;

create or replace function public.get_my_lead_allowance() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_plan text; v_used integer; v_limit integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  select coalesce((select plan from public.subscriptions where user_id=auth.uid()
    and status in ('active','trialing') limit 1),'free') into v_plan;
  v_limit:=case when v_plan='starter' and not public.is_super_admin() then 50 else null end;
  select count(*) into v_used from public.wpm_leads l
    join public.wpm_clients c on c.id=l.client_id
    where c.owner_user_id=auth.uid() and l.created_at>=date_trunc('month',now());
  return jsonb_build_object('plan',v_plan,'used',v_used,'limit',v_limit,'period_start',date_trunc('month',now()));
end;
$$;
revoke execute on function public.get_my_lead_allowance() from public,anon;
grant execute on function public.get_my_lead_allowance() to authenticated;
