-- Hold the first lead alert back for a few minutes so late detail lands in it.
--
-- A lead is upserted as the conversation produces detail. Delivery fires on
-- INSERT, so the alert carries whatever was known in that one second. Measured
-- on three real leads, two of them on a customer's own account:
--
--   Gyriel Díaz Santana  19:55:52 phone -> 19:56:23 name + email   (31s)
--   GILSON Borja         19:31:08 name + phone -> 19:31:59 email   (51s)
--                                              -> 19:31:24 intent  (16s)
--   Tanisha              everything in one message, no email ever
--
-- Skywake's owner received "New lead: 7874557043" for the first of those: a
-- phone number and nothing else, for the highest-intent conversation of the day.
--
-- Three minutes covers all three measured gaps with margin and still lands
-- inside the window where a lead callback actually converts. If nothing more
-- arrives, the alert fires with what it has — the delay never becomes silence.
--
-- Why NOT "mail on UPDATE": leads are upserted repeatedly, so UPDATE mails the
-- same person over and over. That is why INSERT-only was chosen on 2026-08-22
-- and the reasoning still holds. This changes WHEN the single alert is sent,
-- not how many are sent.
--
-- The queue already honours next_attempt_at (`_shared/wpm_actions.ts`, the
-- claim query), so nothing needs to change in the drain. The other half of this
-- fix is in that same file: the send re-reads wpm_leads instead of delivering
-- the snapshot taken here. Delaying alone would just post the same stale row
-- three minutes later.

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
    (client_id, conversation_id, integration_id, tool_name, input_payload, status,
     next_attempt_at)
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
      -- Kept as a fallback for the send, which prefers the live row.
      'lead', jsonb_build_object(
        'full_name', new.full_name,
        'email', new.email,
        'phone', new.phone,
        'intent', new.intent,
        'service_interest', new.service_interest
      )
    ),
    'pending',
    now() + interval '3 minutes'
  );

  return new;
end;
$$;

revoke all on function public.queue_lead_notification_email() from public, anon, authenticated;
