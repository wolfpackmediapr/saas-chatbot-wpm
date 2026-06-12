/*
  # Super admin role

  Adds a platform-level super admin role:

  1. `app_admins` — one row per super admin. RLS enabled with a SELECT-only
     policy for admins themselves; rows can only be added/removed via the
     service role (no API write path → no self-escalation).
  2. `is_super_admin()` — SECURITY DEFINER helper with pinned search_path,
     used by RLS policies. Uses (select auth.uid()) for plan caching.
  3. "Super admins full access" policy on every application table.
  4. Seeds wolfpackmediapr@gmail.com as the first super admin.
*/

-- 1. Admin registry ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES auth.users(id),
  notes text
);

ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;

-- 2. Helper ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_admins
    WHERE user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- Admins can see who the admins are; nobody can write through the API.
CREATE POLICY "Super admins can view admin list"
  ON public.app_admins
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

-- 3. Full-access policies ----------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'user_logs', 'chat_threads', 'chat_messages', 'user_settings',
    'ai_bots', 'wpm_clients', 'wpm_client_channels', 'wpm_bot_profiles',
    'wpm_bot_instructions', 'wpm_knowledge_sources', 'wpm_conversations',
    'wpm_messages', 'wpm_leads', 'wpm_integrations', 'wpm_tool_executions',
    'wpm_webhook_events', 'wpm_handoff_events', 'subscriptions'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY "Super admins full access" ON public.%I '
      'FOR ALL TO authenticated '
      'USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())',
      t
    );
  END LOOP;
END $$;

-- 4. Seed --------------------------------------------------------------------

INSERT INTO public.app_admins (user_id, notes)
SELECT id, 'Platform owner — WolfPack Media'
FROM auth.users
WHERE email = 'wolfpackmediapr@gmail.com'
ON CONFLICT (user_id) DO NOTHING;
