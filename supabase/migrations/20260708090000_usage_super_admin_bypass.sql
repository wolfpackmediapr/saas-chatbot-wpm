/*
  # Super-admin bypass for the conversation cap

  Tier limit triggers (channels/bots) already exempt super admins;
  get_wpm_usage did not, so a super admin's own client would hit the
  free-tier 50-conversation cap and silence its bot. Super admins now
  report an unlimited cap (max_conversations = NULL), which both the
  webhook allowance check and the Subscription usage card honor.
*/

CREATE OR REPLACE FUNCTION public.get_wpm_usage(p_user_id uuid)
RETURNS TABLE (
  conversations_used integer,
  max_conversations integer,
  messages_in integer,
  messages_out integer,
  tokens_used bigint,
  period_start timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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
  owned AS (
    SELECT id FROM public.wpm_clients WHERE owner_user_id = p_user_id
  ),
  month_messages AS (
    SELECT m.conversation_id, m.direction, m.token_usage
    FROM public.wpm_messages m
    WHERE m.client_id IN (SELECT id FROM owned)
      AND m.created_at >= date_trunc('month', now())
  )
  SELECT
    (SELECT count(DISTINCT conversation_id)::integer FROM month_messages WHERE direction = 'inbound'),
    (SELECT CASE
       WHEN is_admin THEN NULL      -- super admins: unlimited
       WHEN name = 'starter' THEN 500
       WHEN name = 'growth'  THEN 2500
       WHEN name = 'pro'     THEN 10000
       WHEN name = 'agency'  THEN NULL  -- unlimited
       ELSE 50                          -- free / trial
     END FROM plan),
    (SELECT count(*)::integer FROM month_messages WHERE direction = 'inbound'),
    (SELECT count(*)::integer FROM month_messages WHERE direction = 'outbound'),
    (SELECT COALESCE(sum((token_usage->>'total_tokens')::bigint), 0) FROM month_messages
      WHERE token_usage ? 'total_tokens'),
    date_trunc('month', now());
$$;
