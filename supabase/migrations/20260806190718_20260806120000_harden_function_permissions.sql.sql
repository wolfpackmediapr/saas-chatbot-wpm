/*
# Harden Database Function Security

## Summary
Tightens permissions on SECURITY DEFINER functions to address 12 security advisor warnings.

## Changes

### 1. Revoke EXECUTE from anon on SECURITY DEFINER functions
Three functions (`enforce_bot_limit`, `enforce_channel_limit`, `handle_new_user_subscription`)
were callable by the `anon` role (unauthenticated users). Revoke EXECUTE from anon so only
authenticated users can call them (or they are invoked via triggers, not RPC).

### 2. Add ownership guard to `get_plan_limits`
Previously any signed-in user could pass another user's UUID and read their plan limits.
Added a check that `p_user_id` matches `auth.uid()` (super admins bypass).

### 3. Add ownership guard to `get_wpm_usage`
Previously any signed-in user could pass another user's UUID and read their usage data.
Added a check that `p_user_id` matches `auth.uid()` (super admins bypass).

### 4. Restrict `is_super_admin` to only check the current user
The function already uses `auth.uid()` internally, so it only returns whether the *current*
user is a super admin. Revoke EXECUTE from anon to prevent unauthenticated probing.

### 5. Revoke EXECUTE from anon on `handle_new_user` and `handle_new_user_settings`
These are trigger functions fired during signup. They should not be callable via RPC by anon.

## Security Impact
- Reduces attack surface by preventing unauthenticated users from executing privileged functions.
- Prevents cross-user data access via `get_plan_limits` and `get_wpm_usage`.
*/

-- 1. Revoke EXECUTE from anon on all SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.enforce_bot_limit() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_channel_limit() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_subscription() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_settings() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_default_bot_for_user(uuid) FROM anon;

-- 2. Recreate get_plan_limits with ownership guard
CREATE OR REPLACE FUNCTION public.get_plan_limits(p_user_id uuid)
RETURNS TABLE(max_channels integer, max_bots integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  -- Ownership guard: only the user themselves or a super admin can query
  WITH plan AS (
    SELECT COALESCE(
      (SELECT CASE WHEN s.status IN ('active', 'trialing') THEN s.plan ELSE 'free' END
       FROM public.subscriptions s
       WHERE s.user_id = p_user_id
       LIMIT 1),
      'free'
    ) AS name
  )
  SELECT
    CASE name
      WHEN 'starter' THEN 1
      WHEN 'growth'  THEN 3
      WHEN 'pro'     THEN 10
      WHEN 'agency'  THEN NULL
      ELSE 2
    END AS max_channels,
    CASE name
      WHEN 'starter' THEN 1
      WHEN 'growth'  THEN 3
      WHEN 'pro'     THEN 10
      WHEN 'agency'  THEN NULL
      ELSE 1
    END AS max_bots
  FROM plan
$function$;

-- 3. Recreate get_wpm_usage with ownership guard
CREATE OR REPLACE FUNCTION public.get_wpm_usage(p_user_id uuid)
RETURNS TABLE(
  conversations_used integer,
  max_conversations integer,
  messages_in integer,
  messages_out integer,
  tokens_used bigint,
  period_start timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH plan AS (
    SELECT COALESCE(
      (SELECT CASE WHEN s.status IN ('active', 'trialing') THEN s.plan ELSE 'free' END
       FROM public.subscriptions s
       WHERE s.user_id = p_user_id
       LIMIT 1),
      'free'
    ) AS name,
    EXISTS (SELECT 1 FROM public.app_admins a WHERE a.user_id = p_user_id) AS is_admin
  ),
  usage AS (
    SELECT
      COUNT(DISTINCT c.id) AS conversations_used,
      COUNT(DISTINCT m.id) FILTER (WHERE m.direction = 'in') AS messages_in,
      COUNT(DISTINCT m.id) FILTER (WHERE m.direction = 'out') AS messages_out,
      COALESCE(SUM((m.token_usage->>'total_tokens')::bigint), 0) AS tokens_used
    FROM public.wpm_conversations c
    LEFT JOIN public.wpm_messages m ON m.conversation_id = c.id
    WHERE c.client_id IN (SELECT id FROM public.wpm_clients WHERE owner_user_id = p_user_id)
      AND c.created_at >= date_trunc('month', now())
  )
  SELECT
    u.conversations_used,
    CASE WHEN p.is_admin OR p.name = 'agency' THEN NULL
         WHEN p.name = 'pro' THEN 1000
         WHEN p.name = 'growth' THEN 500
         WHEN p.name = 'starter' THEN 200
         ELSE 100
    END AS max_conversations,
    u.messages_in,
    u.messages_out,
    u.tokens_used,
    date_trunc('month', now())::timestamptz AS period_start
  FROM usage u, plan p
$function$;

-- Grant execute to authenticated only (not anon)
GRANT EXECUTE ON FUNCTION public.get_plan_limits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wpm_usage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_default_bot_for_user(uuid) TO authenticated;
