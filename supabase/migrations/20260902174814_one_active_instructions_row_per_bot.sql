-- One agent must have exactly one active instructions row.
--
-- Every reader already assumes this: the frontend's getBotInstructions() does
-- .eq('is_active', true).maybeSingle(), and the edge functions do
-- .eq('is_active', true).order('version', desc).limit(1). Nothing enforced it.
--
-- On 2026-09-02 a signup race gave one account three active rows. From then on
-- maybeSingle() errored, getBotInstructions() collapsed that error to null,
-- ensureDefaultBotSetup() read null as "instructions are missing" and inserted
-- another default row on every dashboard page load. It reached 134 rows in
-- under three hours, and the customer's real 5,894-character configuration was
-- one row among 133 auto-generated defaults that the agent never read.
--
-- A partial unique index makes that state unrepresentable. Note this is
-- compatible with the planned INSERT-and-flip instruction history: deactivate
-- the current row and insert the replacement inside one transaction.
create unique index if not exists wpm_bot_instructions_one_active_per_bot
  on public.wpm_bot_instructions (bot_profile_id)
  where is_active;
