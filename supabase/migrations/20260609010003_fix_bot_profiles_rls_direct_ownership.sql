-- Add owner_user_id directly to wpm_bot_profiles so RLS can use a simple
-- auth.uid() = owner_user_id check instead of a JOIN through wpm_clients.
-- This avoids any resolution failures when the linked client row has a
-- null owner_user_id (e.g. seeded/orphaned rows).

-- ── wpm_bot_profiles ─────────────────────────────────────────────────────────

ALTER TABLE public.wpm_bot_profiles
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill from the parent client for all existing rows that have a real owner.
UPDATE public.wpm_bot_profiles bp
SET    owner_user_id = c.owner_user_id
FROM   public.wpm_clients c
WHERE  c.id = bp.client_id
  AND  c.owner_user_id IS NOT NULL
  AND  bp.owner_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_wpm_bot_profiles_owner_user_id
  ON public.wpm_bot_profiles(owner_user_id);

-- Replace the JOIN-based FOR ALL policy with four verb-specific direct checks.
DROP POLICY IF EXISTS "WPM users can manage owned bot profiles" ON public.wpm_bot_profiles;

CREATE POLICY "select_own_bot_profiles"
  ON public.wpm_bot_profiles FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY "insert_own_bot_profiles"
  ON public.wpm_bot_profiles FOR INSERT
  TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "update_own_bot_profiles"
  ON public.wpm_bot_profiles FOR UPDATE
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "delete_own_bot_profiles"
  ON public.wpm_bot_profiles FOR DELETE
  TO authenticated
  USING (owner_user_id = auth.uid());

-- ── wpm_bot_instructions ──────────────────────────────────────────────────────

ALTER TABLE public.wpm_bot_instructions
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill via bot_profiles → clients chain.
UPDATE public.wpm_bot_instructions bi
SET    owner_user_id = c.owner_user_id
FROM   public.wpm_bot_profiles bp
JOIN   public.wpm_clients c ON c.id = bp.client_id
WHERE  bp.id = bi.bot_profile_id
  AND  c.owner_user_id IS NOT NULL
  AND  bi.owner_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_wpm_bot_instructions_owner_user_id
  ON public.wpm_bot_instructions(owner_user_id);

DROP POLICY IF EXISTS "WPM users can manage owned bot instructions" ON public.wpm_bot_instructions;

CREATE POLICY "select_own_bot_instructions"
  ON public.wpm_bot_instructions FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY "insert_own_bot_instructions"
  ON public.wpm_bot_instructions FOR INSERT
  TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "update_own_bot_instructions"
  ON public.wpm_bot_instructions FOR UPDATE
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "delete_own_bot_instructions"
  ON public.wpm_bot_instructions FOR DELETE
  TO authenticated
  USING (owner_user_id = auth.uid());
