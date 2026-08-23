-- Email the business when a lead is captured, with zero configuration.
--
-- Until now the one event this product exists to produce was the one event
-- nobody was told about: a captured lead was silent unless the owner happened
-- to have the dashboard open or had already wired up a Zapier hook. Escalation
-- email has worked out of the box since 08-13; leads deserve the same.
--
-- Deliberately a trigger rather than a call inside wpm_leads.ts: that module is
-- bundled into meta-direct-webhook, and adding this there would mean
-- redeploying the function that answers live customers. This route touches the
-- reply path not at all, and reuses the delivery queue and retry machinery that
-- the webhook work already proved.

alter table public.wpm_clients
  add column if not exists lead_email_enabled boolean not null default true,
  add column if not exists lead_email_override text;

comment on column public.wpm_clients.lead_email_enabled is
  'Opt-out for new-lead email. Defaults true so notification works from signup.';
comment on column public.wpm_clients.lead_email_override is
  'Optional address for lead email. NULL uses the handoff-contact chain.';

create or replace function public.queue_lead_notification_email()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_enabled boolean;
  v_override text;
  v_bot_profile_id uuid;
begin
  select c.lead_email_enabled, c.lead_email_override
    into v_enabled, v_override
  from public.wpm_clients c
  where c.id = new.client_id;

  if coalesce(v_enabled, true) is not true then
    return new;
  end if;

  -- The conversation knows which agent handled it, which is the first link in
  -- the recipient chain (agent handoff contact -> business email -> signup email).
  select cv.bot_profile_id into v_bot_profile_id
  from public.wpm_conversations cv
  where cv.id = new.conversation_id;

  insert into public.wpm_tool_executions
    (client_id, conversation_id, integration_id, tool_name, input_payload, status)
  values (
    new.client_id,
    new.conversation_id,
    null,                       -- email is not an integration; nothing to configure
    'email.qualified_lead',
    jsonb_build_object(
      'lead_id', new.id,
      'bot_profile_id', v_bot_profile_id,
      'override_to', v_override,
      'channel_label', coalesce(new.source_channel, 'your channels'),
      'lead', jsonb_build_object(
        'full_name', new.full_name,
        'email', new.email,
        'phone', new.phone,
        'intent', new.intent,
        'service_interest', new.service_interest
      )
    ),
    'pending'
  );

  return new;
end;
$$;

-- AFTER INSERT only. Leads are upserted as a conversation progresses and more
-- detail arrives; firing on UPDATE would email the same person repeatedly for
-- one lead.
drop trigger if exists trg_queue_lead_notification_email on public.wpm_leads;
create trigger trg_queue_lead_notification_email
  after insert on public.wpm_leads
  for each row execute function public.queue_lead_notification_email();

revoke all on function public.queue_lead_notification_email() from public, anon, authenticated;
