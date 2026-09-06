-- Restored from production migration history (20260825214503).
-- The service-role usage path permits a NULL auth.uid(); anonymous callers
-- must therefore have no EXECUTE privilege, including via PUBLIC.
revoke execute on function public.get_wpm_usage(uuid) from public;
revoke execute on function public.get_wpm_usage(uuid) from anon;
