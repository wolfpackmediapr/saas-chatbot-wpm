/*
  # Tier limit enforcement

  Enforces per-plan channel and bot caps at the database level so every
  insert path (frontend, edge functions, API) is covered:

  | plan    | channels  | bots |
  |---------|-----------|------|
  | free    | 2         | 1    |
  | starter | 1         | 1    |
  | growth  | 3         | 2    |
  | pro     | 10        | 3    |
  | agency  | unlimited | 10   |

  - Limits count ACTIVE rows across all clients owned by the subscribing user.
  - A subscription whose status is not active/trialing falls back to free.
  - Super admins (app_admins) bypass enforcement entirely.
  - Existing rows are grandfathered; only new activations are blocked.
  - free is 2 (not 1) because a Meta connect of a Page with a linked IG
    account creates two channel rows.
*/

CREATE OR REPLACE FUNCTION public.get_plan_limits(p_user_id uuid)
RETURNS TABLE (max_channels integer, max_bots integer)
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
  )
  SELECT
    CASE name
      WHEN 'starter' THEN 1
      WHEN 'growth'  THEN 3
      WHEN 'pro'     THEN 10
      WHEN 'agency'  THEN NULL  -- unlimited
      ELSE 2                    -- free
    END,
    CASE name
      WHEN 'starter' THEN 1
      WHEN 'growth'  THEN 2
      WHEN 'pro'     THEN 3
      WHEN 'agency'  THEN 10
      ELSE 1                    -- free
    END
  FROM plan;
$$;

REVOKE ALL ON FUNCTION public.get_plan_limits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_plan_limits(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_channel_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid;
  v_max integer;
  v_count integer;
BEGIN
  -- Only enforce when a channel becomes active
  IF NEW.is_active IS DISTINCT FROM true THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active = true THEN RETURN NEW; END IF;

  SELECT owner_user_id INTO v_owner FROM public.wpm_clients WHERE id = NEW.client_id;
  IF v_owner IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = v_owner) THEN RETURN NEW; END IF;

  SELECT max_channels INTO v_max FROM public.get_plan_limits(v_owner);
  IF v_max IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_count
  FROM public.wpm_client_channels ch
  JOIN public.wpm_clients c ON c.id = ch.client_id
  WHERE c.owner_user_id = v_owner AND ch.is_active = true AND ch.id <> NEW.id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Channel limit reached for your plan (max % active). Upgrade to connect more channels.', v_max;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_bot_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid;
  v_max integer;
  v_count integer;
BEGIN
  IF NEW.is_active IS DISTINCT FROM true THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active = true THEN RETURN NEW; END IF;

  SELECT owner_user_id INTO v_owner FROM public.wpm_clients WHERE id = NEW.client_id;
  IF v_owner IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = v_owner) THEN RETURN NEW; END IF;

  SELECT max_bots INTO v_max FROM public.get_plan_limits(v_owner);
  IF v_max IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_count
  FROM public.wpm_bot_profiles bp
  JOIN public.wpm_clients c ON c.id = bp.client_id
  WHERE c.owner_user_id = v_owner AND bp.is_active = true AND bp.id <> NEW.id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Bot limit reached for your plan (max % active). Upgrade to add more bots.', v_max;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_channel_limit ON public.wpm_client_channels;
CREATE TRIGGER trg_enforce_channel_limit
  BEFORE INSERT OR UPDATE OF is_active ON public.wpm_client_channels
  FOR EACH ROW EXECUTE FUNCTION public.enforce_channel_limit();

DROP TRIGGER IF EXISTS trg_enforce_bot_limit ON public.wpm_bot_profiles;
CREATE TRIGGER trg_enforce_bot_limit
  BEFORE INSERT OR UPDATE OF is_active ON public.wpm_bot_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_bot_limit();
