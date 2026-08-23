-- Nothing has ever invoked wpm-actions-processor: no pg_cron, no pg_net, no CI.
-- Qualified leads were queued and then sat forever. This is the drain.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- The processor's shared secret lives in Vault, never in cron.job's plaintext
-- command and never in the repo.
create or replace function public.drain_lead_webhooks()
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
    raise warning 'drain_lead_webhooks: vault secrets missing, skipping';
    return;
  end if;

  -- Fire and forget. pg_net queues the request; the processor does the work and
  -- records the outcome on each row, so there is nothing to read back here.
  perform net.http_post(
    url     := v_url || '/functions/v1/wpm-actions-processor',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-wpm-action-secret', v_secret),
    body    := jsonb_build_object('batchSize', 25),
    timeout_milliseconds := 20000
  );
end;
$$;

revoke all on function public.drain_lead_webhooks() from public, anon, authenticated;

comment on function public.drain_lead_webhooks() is
  'Scheduled drain for wpm_tool_executions. Called by cron only; not part of the API surface.';

-- NOTE: the cron schedule itself and the `wpm_action_processor_secret` vault
-- entry are created out-of-band, because the schedule is inert until the secret
-- exists and the secret must never be committed. See the session notes.
