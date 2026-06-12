/*
  # Update subscriptions.plan check constraint to the 4-tier plan names

  Old: free/basic/professional/enterprise — blocked the Stripe webhook from
  writing the new tier names (starter/growth/pro/agency).
*/

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN ('free', 'starter', 'growth', 'pro', 'agency'));
