# SaaS reliability and lead entitlements

Prepared September 5, 2026. These are proposed changes; this file is not evidence of a production deployment.

## Behavior

- Incorporates the changes from PRs #10 and #11. Explicit requests for a person and configured emergency keywords now create a handoff before usage checks and AI calls. Business echoes without readable text remain visible.
- Failed sends are excluded from model context and handoff engagement checks. Inbox understands both human and AI send-failure fields and observes delivery updates.
- Qualified conversations can become leads using the provider's conversation identity without an invented email, phone, or name. Bare assent needs a preceding invitation; the new AI reply cannot establish commitment.
- Starter includes 50 captured leads per calendar month across the subscription's businesses. Growth, Pro, and Agency have no additional lead-count cap. Free trial capture uses its existing message/time allowance. Existing lead enrichment does not consume another slot or resend first-capture actions.
- Starter's channel, bot, and conversation limits remain 1 / 1 / 500; Growth 3 / 2 / 2,500; Pro 10 / 3 / 10,000; Agency unlimited / 10 / unlimited. Super-admin privileges remain separate from the Agency subscription. No existing account roles or subscriptions are modified.
- Instruction saves append a revision atomically and preserve previous text. Leads links target real Inbox routes, including closed conversations, under RLS. Leads are paginated.
- Test Agent validates supplied conversation ownership before service-role writes and respects usage allowance.

## Database and deployment order

1. Review the new migrations and apply only `preserve_instruction_history` and `lead_capture_entitlements` to production. Record their actual registered versions in repository filenames before merge. Do not replay the full migration directory: unrelated historical migration drift remains.
2. The restored `20260825214503` security migration is already registered in production. The trial migration is renamed to its registered `20260825214428` version, and explicitly revokes PUBLIC/anon access after recreating the function. These repository corrections require no live replay.
3. Merge only after the two new database functions/lead trigger are present. The new instruction-save path depends on its RPC.
4. Deploy `meta-direct-webhook` and `wpm-test-chat` from the exact approved commit. Shared changes are bundled into those functions. No `inbox-reply` deployment is required for this change.
5. Verify versions/content hashes, production bundle, roles, tier limits, and behavior. Coordinate the webhook deployment with any other operator before deployment; snapshot its then-current bundle for rollback.

## Validation and limits

- Deno behavior and architecture checks; frontend typecheck and production build.
- PostgreSQL-in-WASM integration tests exercise revision retention, rollback, cross-tenant rejection, anonymous privileges, security migration replay, all tier limits, owner-wide Starter capture cap, enrichment, upgrades, trial expiry, and the Agency/super-admin distinction. Run `npm ci --prefix scripts/tests` then `node scripts/tests/instruction-history.mjs` from repository root.
- Eight new checks fail against the previous behavior, retaining new types for the comparison. The webhook ordering test is an architecture guard, not an end-to-end delivery test.
- No real Meta messages, customer notifications, Stripe charges, or production mutations were used in testing.
- Inbound unreadable story replies, reaction attribution, Meta App Review status, and the rest of agency business-switching work are not implemented here.
- Database tests use a focused schema with tenant policies, not a full production clone. Production rollout still needs migration and Edge Function verification.
