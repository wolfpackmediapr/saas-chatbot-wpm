-- Badge state for the sidebar: "what has happened since I last looked".
-- Stored per user rather than in the browser so the count is the same on a
-- phone and a laptop, and so clearing it on one device clears it everywhere.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS inbox_last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS leads_last_seen_at timestamptz;

COMMENT ON COLUMN public.user_settings.inbox_last_seen_at IS
  'When the user last opened the Inbox. Conversations with newer inbound activity count as unread.';
COMMENT ON COLUMN public.user_settings.leads_last_seen_at IS
  'When the user last opened Leads. Leads created after this count as new.';

-- Leads and handoff events drive the new alerts, but neither was in the
-- realtime publication, so nothing would ever have been delivered live.
ALTER PUBLICATION supabase_realtime ADD TABLE public.wpm_leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wpm_handoff_events;
