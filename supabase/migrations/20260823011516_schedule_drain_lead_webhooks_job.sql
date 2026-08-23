-- Every 2 minutes. Lead delivery is not sub-minute urgent, and while the Vault
-- secret is absent the drain returns early with a warning, so a longer interval
-- keeps that signal visible without flooding the log.
-- cron.schedule upserts by jobname, so re-running this is safe.
select cron.schedule(
  'drain-lead-webhooks',
  '*/2 * * * *',
  $$select public.drain_lead_webhooks();$$
);
