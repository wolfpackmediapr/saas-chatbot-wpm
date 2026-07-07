/*
  # One subscriptions row per user

  Every consumer (get_plan_limits, get_wpm_usage, Subscription.tsx
  maybeSingle) assumes at most one row per user, and the Stripe edge
  functions are moving from UPDATE-only writes to upserts, which need a
  conflict target. Live data verified duplicate-free before adding.
*/

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
