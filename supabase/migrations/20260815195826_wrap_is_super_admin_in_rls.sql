-- Wrap is_super_admin() in a scalar subquery across all 20 RLS policies that
-- call it.
--
-- Bare `is_super_admin()` in a policy expression is re-evaluated FOR EVERY ROW
-- the policy is checked against. Wrapping it as `(SELECT is_super_admin())`
-- makes Postgres hoist it into a one-shot InitPlan, exactly like the standard
-- `(SELECT auth.uid())` fix. On a table scan of N rows this turns N calls into
-- one.
--
-- Semantically identical here: is_super_admin() is STABLE, SECURITY DEFINER,
-- with search_path pinned to '' — so its value cannot change within a single
-- statement, and hoisting it changes nothing but the call count.
--
-- Supabase's linter will never flag this. `auth_rls_initplan` only inspects
-- `auth.*`, so a custom STABLE helper stays invisible to it no matter how many
-- times it runs. These 20 were found by querying pg_policies directly.
--
-- ALTER POLICY (rather than DROP + CREATE) is deliberate: it swaps only the
-- expressions while preserving each policy's command, roles and PERMISSIVE
-- flag, and it never leaves a window in which the table is unprotected.
--
-- app_admins is SELECT-only and therefore has no WITH CHECK clause to alter.

ALTER POLICY "Super admins full access" ON public.ai_bots               USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
ALTER POLICY "Super admins can view admin list" ON public.app_admins    USING ((SELECT public.is_super_admin()));
ALTER POLICY "Super admins full access" ON public.chat_messages         USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
ALTER POLICY "Super admins full access" ON public.chat_threads          USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
ALTER POLICY "Super admins full access" ON public.profiles              USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
ALTER POLICY "Super admins full access" ON public.subscriptions         USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
ALTER POLICY "Super admins full access" ON public.user_logs             USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
ALTER POLICY "Super admins full access" ON public.user_settings         USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
ALTER POLICY "Super admins full access" ON public.wpm_bot_instructions  USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
ALTER POLICY "Super admins full access" ON public.wpm_bot_profiles      USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
ALTER POLICY "Super admins full access" ON public.wpm_client_channels   USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
ALTER POLICY "Super admins full access" ON public.wpm_clients           USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
ALTER POLICY "Super admins full access" ON public.wpm_conversations     USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
ALTER POLICY "Super admins full access" ON public.wpm_handoff_events    USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
ALTER POLICY "Super admins full access" ON public.wpm_integrations      USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
ALTER POLICY "Super admins full access" ON public.wpm_knowledge_sources USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
ALTER POLICY "Super admins full access" ON public.wpm_leads             USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
ALTER POLICY "Super admins full access" ON public.wpm_messages          USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
ALTER POLICY "Super admins full access" ON public.wpm_tool_executions   USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
ALTER POLICY "Super admins full access" ON public.wpm_webhook_events    USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
