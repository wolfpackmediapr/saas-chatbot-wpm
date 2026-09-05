-- Save a complete instruction revision atomically. The parent lock serializes
-- initial creation as well as later edits; expected_version detects stale forms.
create or replace function public.save_wpm_bot_instructions(
  p_bot_profile_id uuid, p_updates jsonb, p_expected_version integer
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_current public.wpm_bot_instructions%rowtype;
  v_next public.wpm_bot_instructions%rowtype;
  v_version integer;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select coalesce(b.owner_user_id, c.owner_user_id) into v_owner
    from public.wpm_bot_profiles b join public.wpm_clients c on c.id=b.client_id
    where b.id=p_bot_profile_id
      and (c.owner_user_id=auth.uid() or public.is_super_admin())
    for update of b;
  if not found then
    raise exception 'Agent unavailable or not owned by this account' using errcode = '42501';
  end if;
  select * into v_current from public.wpm_bot_instructions
    where bot_profile_id=p_bot_profile_id and is_active
    order by version desc limit 1;
  if p_expected_version is distinct from coalesce(v_current.version, 0) then
    raise exception 'Instructions changed since this page loaded. Reload before saving.'
      using errcode = '40001';
  end if;
  select coalesce(max(version),0)+1 into v_version from public.wpm_bot_instructions
    where bot_profile_id=p_bot_profile_id;
  select * into v_next from jsonb_populate_record(
    null::public.wpm_bot_instructions,
    coalesce(to_jsonb(v_current),'{}'::jsonb) || coalesce(p_updates,'{}'::jsonb)
  );
  update public.wpm_bot_instructions set is_active=false
    where bot_profile_id=p_bot_profile_id and is_active;
  insert into public.wpm_bot_instructions (
    bot_profile_id,owner_user_id,system_prompt,business_summary,faq_instructions,
    lead_qualification_instructions,handoff_rules,never_say_rules,primary_goal,
    response_language,emergency_keywords,lead_fields,is_active,version
  ) values (
    p_bot_profile_id,v_owner,coalesce(v_next.system_prompt,''),v_next.business_summary,
    v_next.faq_instructions,v_next.lead_qualification_instructions,v_next.handoff_rules,
    v_next.never_say_rules,coalesce(v_next.primary_goal,'Book a meeting'),
    coalesce(v_next.response_language,'English + Latin American Spanish'),
    coalesce(v_next.emergency_keywords,'{}'::text[]),coalesce(v_next.lead_fields,'[]'::jsonb),
    true,v_version
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.save_wpm_bot_instructions(uuid,jsonb,integer) from public, anon;
grant execute on function public.save_wpm_bot_instructions(uuid,jsonb,integer) to authenticated;
