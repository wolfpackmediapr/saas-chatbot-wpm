/*
  # Channel → bot assignment

  Adds `bot_profile_id` to `wpm_client_channels` so each connected channel can
  be routed to a specific bot (multi-bot tiers: Pro = 3 bots, Agency = 10).
  Channels with NULL keep the legacy behavior (first active bot for the client).
*/

ALTER TABLE public.wpm_client_channels
  ADD COLUMN IF NOT EXISTS bot_profile_id uuid REFERENCES public.wpm_bot_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wpm_client_channels_bot_profile_id
  ON public.wpm_client_channels (bot_profile_id);
