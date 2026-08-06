/*
# Revoke PUBLIC Execute on Trigger Functions

## Summary
Three SECURITY DEFINER trigger functions still had EXECUTE granted to PUBLIC
(which includes the anon role). Revoke PUBLIC EXECUTE so only authenticated,
service_role, and postgres can run them.

## Functions affected:
- enforce_bot_limit() — trigger function, should only fire via trigger
- enforce_channel_limit() — trigger function, should only fire via trigger
- handle_new_user_subscription() — trigger function, should only fire via trigger
*/

REVOKE EXECUTE ON FUNCTION public.enforce_bot_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_channel_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_subscription() FROM PUBLIC;
