-- Woztell is retired. WhatsApp will be built direct on the Meta Cloud API with
-- no third-party BSP, so nothing will ever legitimately be a 'woztell' row again.
--
-- Both columns are NOT NULL DEFAULT 'woztell', which means any insert that
-- forgets `provider` gets silently labelled with a dead vendor rather than
-- failing. Routing filters on provider, so a mislabelled channel simply would
-- not match inbound traffic -- the same silent-failure shape that has cost this
-- project time before. Every current insert sets provider explicitly (verified
-- across src/ and supabase/functions/), so dropping the default costs nothing
-- today and makes a forgotten provider fail loudly instead of quietly, right as
-- the WhatsApp work is about to add a new provider value.
alter table public.wpm_client_channels alter column provider drop default;
alter table public.wpm_webhook_events  alter column provider drop default;
