ALTER TABLE public.wpm_bot_instructions
  ADD COLUMN IF NOT EXISTS primary_goal      text NOT NULL DEFAULT 'Book a Calendly meeting',
  ADD COLUMN IF NOT EXISTS response_language text NOT NULL DEFAULT 'English + Latin American Spanish';
