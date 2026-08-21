-- Align get_plan_limits.max_bots with what the pricing page actually sells.
--
-- The max_bots CASE was a verbatim copy of the max_channels CASE — same
-- 10 / 3 / 1 / NULL arms — and was never adjusted to the bot numbers. The
-- channel arms were correct, so only max_bots changes here.
--
--   Plan      page says   code granted   now grants
--   Starter   1           1              1     (unchanged)
--   Growth    2           3              2
--   Pro       3           10             3
--   Agency    10          unlimited      10
--
-- Direction matters: unlike the other page-vs-code defects in this codebase,
-- the code was MORE generous than the page. So this is not a false-advertising
-- fix — it is closing revenue leakage before live Stripe billing goes on, and
-- it restores "10 AI bots" as a real Agency differentiator over Pro's 3.
--
-- Safe to apply: the highest active bot count on any account is 2, so no
-- existing user is over the new ceiling.
--
-- NOTE: super admins are split out of the agency arm and keep NULL (unlimited).
-- Previously `is_admin OR name = 'agency'` shared one arm; now that agency is
-- a finite 10, folding them together would have capped super admins at 10 too.
-- max_channels deliberately keeps the combined arm — unlimited is correct for
-- both there.

CREATE OR REPLACE FUNCTION public.get_plan_limits(p_user_id uuid)
 RETURNS TABLE(max_channels integer, max_bots integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Ownership guard. MUST permit auth.uid() IS NULL: the webhook calls this
  -- via service_role for an arbitrary owner and that path has no JWT.
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
      WHEN p.is_admin        THEN NULL   -- super admins stay unlimited
      WHEN p.name = 'agency' THEN 10     -- was NULL; page sells 10
      WHEN p.name = 'pro'     THEN 3     -- was 10; page sells 3
      WHEN p.name = 'growth'  THEN 2     -- was 3;  page sells 2
      WHEN p.name = 'starter' THEN 1
      ELSE 1
    END::integer AS max_bots
  FROM plan p;
END;
$function$;
