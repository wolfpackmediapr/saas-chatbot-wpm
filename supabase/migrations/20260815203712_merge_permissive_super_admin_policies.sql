-- Fold "Super admins full access" into each table's owner policy, on the 13
-- tables where doing so is capability-preserving.
--
-- Every table carried two PERMISSIVE policies for `authenticated`: the owner
-- policy and a separate `Super admins full access`. Postgres OR-s permissive
-- policies together, so each one is a `multiple_permissive_policies` warning
-- per CRUD action — 52 of the project's 63 come from these 13 tables.
--
-- ONLY 13 OF 19 TABLES ARE TOUCHED. The merge is safe exactly when the owner
-- policy already covers every command the admin policy did:
--
--   * owner policy is a single ALL policy  (7 tables)
--   * owner policies cover all four commands separately  (6 tables)
--
-- The other six — profiles, subscriptions, user_logs, user_settings,
-- wpm_tool_executions, wpm_webhook_events — have owner policies NARROWER than
-- the admin's ALL (subscriptions, wpm_tool_executions and wpm_webhook_events
-- are SELECT-only). Folding the admin policy into them would silently revoke
-- super-admin INSERT/UPDATE/DELETE, so they are deliberately left alone and
-- keep their 11 warnings. Removing a capability is not a lint fix.
--
-- Order is load-bearing: widen the owner policies FIRST, drop the admin policy
-- SECOND. At no point does any principal lose access mid-transaction, and the
-- widened form never grants more than the admin policy already did.

-- === Owner keyed directly on the row (user_id) ===
ALTER POLICY "Users can view their own bots"   ON public.ai_bots USING (((SELECT auth.uid()) = user_id) OR (SELECT public.is_super_admin()));
ALTER POLICY "Users can insert their own bots" ON public.ai_bots WITH CHECK (((SELECT auth.uid()) = user_id) OR (SELECT public.is_super_admin()));
ALTER POLICY "Users can update their own bots" ON public.ai_bots USING (((SELECT auth.uid()) = user_id) OR (SELECT public.is_super_admin())) WITH CHECK (((SELECT auth.uid()) = user_id) OR (SELECT public.is_super_admin()));
ALTER POLICY "Users can delete their own bots" ON public.ai_bots USING (((SELECT auth.uid()) = user_id) OR (SELECT public.is_super_admin()));

ALTER POLICY "Users can view their own chat threads"   ON public.chat_threads USING (((SELECT auth.uid()) = user_id) OR (SELECT public.is_super_admin()));
ALTER POLICY "Users can create their own chat threads" ON public.chat_threads WITH CHECK (((SELECT auth.uid()) = user_id) OR (SELECT public.is_super_admin()));
ALTER POLICY "Users can update their own chat threads" ON public.chat_threads USING (((SELECT auth.uid()) = user_id) OR (SELECT public.is_super_admin())) WITH CHECK (((SELECT auth.uid()) = user_id) OR (SELECT public.is_super_admin()));
ALTER POLICY "Users can delete their own chat threads" ON public.chat_threads USING (((SELECT auth.uid()) = user_id) OR (SELECT public.is_super_admin()));

-- === Owner keyed directly on the row (owner_user_id) ===
ALTER POLICY select_own_bot_instructions ON public.wpm_bot_instructions USING (((SELECT auth.uid()) = owner_user_id) OR (SELECT public.is_super_admin()));
ALTER POLICY insert_own_bot_instructions ON public.wpm_bot_instructions WITH CHECK (((SELECT auth.uid()) = owner_user_id) OR (SELECT public.is_super_admin()));
ALTER POLICY update_own_bot_instructions ON public.wpm_bot_instructions USING (((SELECT auth.uid()) = owner_user_id) OR (SELECT public.is_super_admin())) WITH CHECK (((SELECT auth.uid()) = owner_user_id) OR (SELECT public.is_super_admin()));
ALTER POLICY delete_own_bot_instructions ON public.wpm_bot_instructions USING (((SELECT auth.uid()) = owner_user_id) OR (SELECT public.is_super_admin()));

ALTER POLICY select_own_bot_profiles ON public.wpm_bot_profiles USING (((SELECT auth.uid()) = owner_user_id) OR (SELECT public.is_super_admin()));
ALTER POLICY insert_own_bot_profiles ON public.wpm_bot_profiles WITH CHECK (((SELECT auth.uid()) = owner_user_id) OR (SELECT public.is_super_admin()));
ALTER POLICY update_own_bot_profiles ON public.wpm_bot_profiles USING (((SELECT auth.uid()) = owner_user_id) OR (SELECT public.is_super_admin())) WITH CHECK (((SELECT auth.uid()) = owner_user_id) OR (SELECT public.is_super_admin()));
ALTER POLICY delete_own_bot_profiles ON public.wpm_bot_profiles USING (((SELECT auth.uid()) = owner_user_id) OR (SELECT public.is_super_admin()));

ALTER POLICY "WPM users can view owned clients"   ON public.wpm_clients USING (((SELECT auth.uid()) = owner_user_id) OR (SELECT public.is_super_admin()));
ALTER POLICY "WPM users can insert owned clients" ON public.wpm_clients WITH CHECK (((SELECT auth.uid()) = owner_user_id) OR (SELECT public.is_super_admin()));
ALTER POLICY "WPM users can update owned clients" ON public.wpm_clients USING (((SELECT auth.uid()) = owner_user_id) OR (SELECT public.is_super_admin())) WITH CHECK (((SELECT auth.uid()) = owner_user_id) OR (SELECT public.is_super_admin()));
ALTER POLICY "WPM users can delete owned clients" ON public.wpm_clients USING (((SELECT auth.uid()) = owner_user_id) OR (SELECT public.is_super_admin()));

-- === Owner reached through chat_threads ===
ALTER POLICY "Users can view messages in their threads"   ON public.chat_messages USING ((EXISTS (SELECT 1 FROM public.chat_threads WHERE chat_threads.id = chat_messages.thread_id AND chat_threads.user_id = (SELECT auth.uid()))) OR (SELECT public.is_super_admin()));
ALTER POLICY "Users can create messages in their threads" ON public.chat_messages WITH CHECK ((EXISTS (SELECT 1 FROM public.chat_threads WHERE chat_threads.id = chat_messages.thread_id AND chat_threads.user_id = (SELECT auth.uid()))) OR (SELECT public.is_super_admin()));
ALTER POLICY "Users can update messages in their threads" ON public.chat_messages USING ((EXISTS (SELECT 1 FROM public.chat_threads WHERE chat_threads.id = chat_messages.thread_id AND chat_threads.user_id = (SELECT auth.uid()))) OR (SELECT public.is_super_admin()));
ALTER POLICY "Users can delete messages in their threads" ON public.chat_messages USING ((EXISTS (SELECT 1 FROM public.chat_threads WHERE chat_threads.id = chat_messages.thread_id AND chat_threads.user_id = (SELECT auth.uid()))) OR (SELECT public.is_super_admin()));

-- === Owner reached through wpm_clients (single ALL policy each) ===
ALTER POLICY "WPM users can manage owned client channels" ON public.wpm_client_channels
  USING ((EXISTS (SELECT 1 FROM public.wpm_clients c WHERE c.id = wpm_client_channels.client_id AND c.owner_user_id = (SELECT auth.uid()))) OR (SELECT public.is_super_admin()))
  WITH CHECK ((EXISTS (SELECT 1 FROM public.wpm_clients c WHERE c.id = wpm_client_channels.client_id AND c.owner_user_id = (SELECT auth.uid()))) OR (SELECT public.is_super_admin()));

ALTER POLICY "WPM users can manage owned conversations" ON public.wpm_conversations
  USING ((EXISTS (SELECT 1 FROM public.wpm_clients c WHERE c.id = wpm_conversations.client_id AND c.owner_user_id = (SELECT auth.uid()))) OR (SELECT public.is_super_admin()))
  WITH CHECK ((EXISTS (SELECT 1 FROM public.wpm_clients c WHERE c.id = wpm_conversations.client_id AND c.owner_user_id = (SELECT auth.uid()))) OR (SELECT public.is_super_admin()));

ALTER POLICY "WPM users can manage owned handoff events" ON public.wpm_handoff_events
  USING ((EXISTS (SELECT 1 FROM public.wpm_clients c WHERE c.id = wpm_handoff_events.client_id AND c.owner_user_id = (SELECT auth.uid()))) OR (SELECT public.is_super_admin()))
  WITH CHECK ((EXISTS (SELECT 1 FROM public.wpm_clients c WHERE c.id = wpm_handoff_events.client_id AND c.owner_user_id = (SELECT auth.uid()))) OR (SELECT public.is_super_admin()));

ALTER POLICY "WPM users can manage owned integrations" ON public.wpm_integrations
  USING ((EXISTS (SELECT 1 FROM public.wpm_clients c WHERE c.id = wpm_integrations.client_id AND c.owner_user_id = (SELECT auth.uid()))) OR (SELECT public.is_super_admin()))
  WITH CHECK ((EXISTS (SELECT 1 FROM public.wpm_clients c WHERE c.id = wpm_integrations.client_id AND c.owner_user_id = (SELECT auth.uid()))) OR (SELECT public.is_super_admin()));

ALTER POLICY "WPM users can manage owned knowledge sources" ON public.wpm_knowledge_sources
  USING ((EXISTS (SELECT 1 FROM public.wpm_clients c WHERE c.id = wpm_knowledge_sources.client_id AND c.owner_user_id = (SELECT auth.uid()))) OR (SELECT public.is_super_admin()))
  WITH CHECK ((EXISTS (SELECT 1 FROM public.wpm_clients c WHERE c.id = wpm_knowledge_sources.client_id AND c.owner_user_id = (SELECT auth.uid()))) OR (SELECT public.is_super_admin()));

ALTER POLICY "WPM users can manage owned leads" ON public.wpm_leads
  USING ((EXISTS (SELECT 1 FROM public.wpm_clients c WHERE c.id = wpm_leads.client_id AND c.owner_user_id = (SELECT auth.uid()))) OR (SELECT public.is_super_admin()))
  WITH CHECK ((EXISTS (SELECT 1 FROM public.wpm_clients c WHERE c.id = wpm_leads.client_id AND c.owner_user_id = (SELECT auth.uid()))) OR (SELECT public.is_super_admin()));

ALTER POLICY "WPM users can manage owned messages" ON public.wpm_messages
  USING ((EXISTS (SELECT 1 FROM public.wpm_clients c WHERE c.id = wpm_messages.client_id AND c.owner_user_id = (SELECT auth.uid()))) OR (SELECT public.is_super_admin()))
  WITH CHECK ((EXISTS (SELECT 1 FROM public.wpm_clients c WHERE c.id = wpm_messages.client_id AND c.owner_user_id = (SELECT auth.uid()))) OR (SELECT public.is_super_admin()));

-- === Now the admin policy is redundant on exactly these 13 tables ===
DROP POLICY "Super admins full access" ON public.ai_bots;
DROP POLICY "Super admins full access" ON public.chat_messages;
DROP POLICY "Super admins full access" ON public.chat_threads;
DROP POLICY "Super admins full access" ON public.wpm_bot_instructions;
DROP POLICY "Super admins full access" ON public.wpm_bot_profiles;
DROP POLICY "Super admins full access" ON public.wpm_client_channels;
DROP POLICY "Super admins full access" ON public.wpm_clients;
DROP POLICY "Super admins full access" ON public.wpm_conversations;
DROP POLICY "Super admins full access" ON public.wpm_handoff_events;
DROP POLICY "Super admins full access" ON public.wpm_integrations;
DROP POLICY "Super admins full access" ON public.wpm_knowledge_sources;
DROP POLICY "Super admins full access" ON public.wpm_leads;
DROP POLICY "Super admins full access" ON public.wpm_messages;
