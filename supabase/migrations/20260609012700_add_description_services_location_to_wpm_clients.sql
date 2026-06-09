-- Add first-class columns for description, services, and location to wpm_clients
-- so Business Profile fields persist via the clients row write (which always
-- succeeds for authenticated owners) rather than through the bot profile JSON
-- blob (which previously failed due to RLS when no bot profile existed yet).

ALTER TABLE public.wpm_clients
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS services    text,
  ADD COLUMN IF NOT EXISTS location    text;
