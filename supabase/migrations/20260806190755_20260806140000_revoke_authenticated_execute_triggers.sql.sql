/*
# Revoke Authenticated EXECUTE on Trigger-Only Functions

## Summary
Three SECURITY DEFINER functions are trigger functions that should only fire
via database triggers, not via RPC calls from authenticated users. Revoke
EXECUTE from authenticated so they cannot be called via the REST API.

## Functions affected:
- enforce_bot_limit() — fires on ai_bots INSERT/UPDATE trigger
- enforce_channel_limit() — fires on wpm_client_channels INSERT/UPDATE trigger
- handle_new_user_subscription() — fires on auth.users INSERT trigger

These are still executable by service_role and postgres (needed for trigger execution).
*/

REVOKE EXECUTE ON FUNCTION public.enforce_bot_limit() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_channel_limit() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_subscription() FROM authenticated;
