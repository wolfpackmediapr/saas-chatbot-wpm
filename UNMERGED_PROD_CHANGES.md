# Unmerged work — prod is ahead of `main`

**As of 2026-08-15.** Read this before branching, merging or deploying.

> [!] **Two migrations are already applied to production while their branches are
> unmerged.** Applying a migration *is* the change, so this is unavoidable when
> DDL work is done through MCP — but it means `main` does not describe the live
> database. Anyone reading `supabase/migrations/` on `main` will be missing two
> files that are live.

## State

`main` = `97dea05`. Five branches, six commits, none pushed at time of writing.

| Branch | Commit | Surface | Live in prod? |
| --- | --- | --- | --- |
| `fix/delete-token-on-disconnect` | `bc4d4e4` | frontend | No — ships on push to `main` |
| `perf/wrap-is-super-admin-rls` | `7fb2adc` | database | **YES — migration applied** |
| `perf/merge-permissive-policies` | `92c361f` | database | **YES — migration applied** |
| `fix/meta-multi-account-and-routing` | `11e2016` | edge fns + frontend | No — **not deployed** |
| `docs/agency-multi-tenancy-plan` | `6258ae6` | docs | n/a |

Deployed edge functions are `meta-direct-webhook` **v60** and `meta-oauth-callback`
**v24**, both from 2026-08-14 — i.e. *before* the routing fix.

## Live database migrations not on `main`

- `20260815195826_wrap_is_super_admin_in_rls`
- `20260815203712_merge_permissive_super_admin_policies`

Both were applied via MCP `apply_migration` and verified afterwards. Their
filenames match the versions Supabase registered — confirm with
`list_migrations` before assuming otherwise, because `apply_migration` stamps
its own timestamp rather than using the local filename.

### Rollback

Both are `ALTER POLICY`-based and reverse symmetrically.

`wrap_is_super_admin_in_rls` — replace `(SELECT public.is_super_admin())` with a
bare `public.is_super_admin()` on the same 20 policies. No capability change
either way; this only affects how many times the function is evaluated.

`merge_permissive_super_admin_policies` — recreate
`CREATE POLICY "Super admins full access" ON <table> FOR ALL TO authenticated
USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()))`
on the 13 tables, then drop the `OR (SELECT public.is_super_admin())` arm from
each owner policy. **Recreate the admin policy first**, so no principal loses
access mid-transaction — the mirror of how it was applied.

## Deploying the routing fix

`fix/meta-multi-account-and-routing` changes `_shared/wpm_bridge.ts`, which is
**bundled into `meta-direct-webhook`**. Deploying only `meta-oauth-callback`
would leave the nondeterministic agent fallback live. Deploy both:

```bash
npx supabase functions deploy meta-oauth-callback  --project-ref upthfjkxbsqtipzoeecd --use-api
npx supabase functions deploy meta-direct-webhook  --project-ref upthfjkxbsqtipzoeecd --use-api
npx supabase functions list --project-ref upthfjkxbsqtipzoeecd   # confirm — never infer a deploy from a push
```

Until then the routing coin flip described in `AGENCY_MULTI_TENANCY_PLAN.md` is
still live. It is not currently firing: both live channels are explicitly pinned
to the WolfPack Media agent. It is one "Default" selection away.

## Verification already done (do not redo)

- 20 policies wrapped / 0 unwrapped; 19 `ALL` + 1 `SELECT`, roles and PERMISSIVE
  preserved.
- `multiple_permissive_policies` 63 → 11; the 11 are the six deliberately
  skipped tables.
- Super admin reads all 4 clients / 369 messages / 19 conversations and can
  UPDATE another tenant's row; a real tenant sees only its own 1 client and
  updates 0 rows of another tenant's; an unknown uid sees 0. All write probes
  rolled back.
- Security advisors unchanged at the same 5 expected `SECURITY DEFINER` lints.
- `npm run typecheck` 0 errors; `deno test supabase/functions/_shared/` 83 pass.

**Delete this file once all five branches are merged and deployed.**
