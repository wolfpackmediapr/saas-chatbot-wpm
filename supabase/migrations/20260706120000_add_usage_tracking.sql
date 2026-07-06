/*
  # Usage tracking (read model)

  `get_wpm_usage(p_user_id)` returns current-calendar-month usage across all
  clients owned by the user, plus the plan's conversation cap:

  | plan    | conversations/mo |
  |---------|------------------|
  | free    | 50 (trial)       |
  | starter | 500              |
  | growth  | 2,500            |
  | pro     | 10,000           |
  | agency  | unlimited        |

  - "Conversations used" = distinct conversations that received at least one
    inbound message this month (matches the pricing unit on Pricing.tsx).
  - Token totals come from wpm_messages.token_usage recorded by the AI
    pipeline on outbound messages.
  - Read-only: display + upcoming soft-limit checks. No enforcement here.
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
    ) AS name
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
    (SELECT CASE name
       WHEN 'starter' THEN 500
       WHEN 'growth'  THEN 2500
       WHEN 'pro'     THEN 10000
       WHEN 'agency'  THEN NULL  -- unlimited
       ELSE 50                   -- free / trial
     END FROM plan),
    (SELECT count(*)::integer FROM month_messages WHERE direction = 'inbound'),
    (SELECT count(*)::integer FROM month_messages WHERE direction = 'outbound'),
    (SELECT COALESCE(sum((token_usage->>'total_tokens')::bigint), 0) FROM month_messages
      WHERE token_usage ? 'total_tokens'),
    date_trunc('month', now());
$$;

REVOKE ALL ON FUNCTION public.get_wpm_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_wpm_usage(uuid) TO authenticated;
