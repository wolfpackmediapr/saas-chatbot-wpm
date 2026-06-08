ALTER TABLE public.wpm_client_channels
  ADD COLUMN IF NOT EXISTS page_access_token text;
