-- F1: align enforced conversation caps with the numbers sold on the pricing page.
--     Was: starter 200, growth 500, pro 1000 — 5-10x below what customers pay for.
-- F2: add ownership guards. Both functions are SECURITY DEFINER and executable by
--     `authenticated`, take a caller-supplied user id, and never checked it, so any
--     signed-in user could read any other tenant's usage and plan.
--
-- The guard must permit auth.uid() IS NULL: the webhook pipeline calls
-- get_wpm_usage via service_role for an arbitrary client owner
-- (checkConversationAllowance in _shared/wpm_usage.ts). `anon` has no EXECUTE,
-- so a NULL auth.uid() here means a trusted backend context.

CREATE OR REPLACE FUNCTION public.get_wpm_usage(p_user_id uuid)
RETURNS TABLE(
  conversations_used integer,
  max_conversations integer,
  messages_in integer,
  messages_out integer,
  tokens_used bigint,
  period_start timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> p_user_id
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH plan AS (
    SELECT COALESCE(
      (SELECT CASE WHEN s.status IN ('active', 'trialing') THEN s.plan ELSE 'free' END
       FROM public.subscriptions s WHERE s.user_id = p_user_id LIMIT 1),
      'free'
    ) AS name,
    EXISTS (SELECT 1 FROM public.app_admins a WHERE a.user_id = p_user_id) AS is_admin
  ),
  usage AS (
    SELECT
      COUNT(DISTINCT c.id)::integer AS conversations_used,
      COUNT(DISTINCT m.id) FILTER (WHERE m.direction = 'in')::integer AS messages_in,
      COUNT(DISTINCT m.id) FILTER (WHERE m.direction = 'out')::integer AS messages_out,
      COALESCE(SUM((m.token_usage->>'total_tokens')::bigint), 0)::bigint AS tokens_used
    FROM public.wpm_conversations c
    LEFT JOIN public.wpm_messages m ON m.conversation_id = c.id
    WHERE c.client_id IN (SELECT id FROM public.wpm_clients WHERE owner_user_id = p_user_id)
      AND c.created_at >= date_trunc('month', now())
  )
  SELECT
    u.conversations_used,
    CASE
      WHEN p.is_admin OR p.name = 'agency' THEN NULL
      WHEN p.name = 'pro'     THEN 10000
      WHEN p.name = 'growth'  THEN 2500
      WHEN p.name = 'starter' THEN 500
      ELSE 100
    END::integer AS max_conversations,
    u.messages_in,
    u.messages_out,
    u.tokens_used,
    date_trunc('month', now())::timestamptz AS period_start
  FROM usage u, plan p;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_plan_limits(p_user_id uuid)
RETURNS TABLE(max_channels integer, max_bots integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> p_user_id
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH plan AS (
    SELECT COALESCE(
      (SELECT CASE WHEN s.status IN ('active', 'trialing') THEN s.plan ELSE 'free' END
       FROM public.subscriptions s WHERE s.user_id = p_user_id LIMIT 1),
      'free'
    ) AS name,
    -- Super admins were capped at the free tier (2 channels / 1 bot) because
    -- only get_wpm_usage had an admin bypass. Mirror it here.
    EXISTS (SELECT 1 FROM public.app_admins a WHERE a.user_id = p_user_id) AS is_admin
  )
  SELECT
    CASE
      WHEN p.is_admin OR p.name = 'agency' THEN NULL
      WHEN p.name = 'pro'     THEN 10
      WHEN p.name = 'growth'  THEN 3
      WHEN p.name = 'starter' THEN 1
      ELSE 2
    END::integer AS max_channels,
    CASE
      WHEN p.is_admin OR p.name = 'agency' THEN NULL
      WHEN p.name = 'pro'     THEN 10
      WHEN p.name = 'growth'  THEN 3
      WHEN p.name = 'starter' THEN 1
      ELSE 1
    END::integer AS max_bots
  FROM plan p;
END;
$function$;
