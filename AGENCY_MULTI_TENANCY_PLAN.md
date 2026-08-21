# Agency multi-tenancy

> **STATUS: UNBLOCKED — READY TO START.**
>
> **The gate opened.** Meta App Review was **approved on 2026-08-20**, granting
> **Advanced Access** on `pages_messaging`, `instagram_manage_messages` and
> `pages_manage_metadata`, with `public_profile` renewed and App Mode set to
> Live. The OAuth-scope freeze this plan waited on is lifted.
>
> The other precondition — `main` clean with every branch merged and deployed —
> was met on 2026-08-21.
>
> **Do this before WhatsApp** (`WHATSAPP_CLOUD_API_PLAN.md`). This work reshapes
> how channels attach to clients; doing it after a third channel type exists
> means migrating three kinds of channel instead of two. WhatsApp also re-opens
> App Review, which this plan explicitly avoids.

Written 2026-08-15. Owner: Wilf.

---

## The problem in one line

**One login maps to exactly one client**, so an agency running several
businesses has all of them collapsed into a single tenant.

`supabase/functions/meta-oauth-callback/index.ts` resolves the tenant as:

```ts
.from("wpm_clients").select("id")
.eq("owner_user_id", supabase_user_id)
.order("created_at", { ascending: true })
.limit(1)          // ← the oldest client, always
```

`getOwnedWpmClient()` in `src/lib/supabase/wpmClients.ts` does the same thing.
So every Page connected under one login lands on one `client_id`, and every
conversation, lead, knowledge source and Inbox row mixes businesses together.

This is already visible in production: the `WolfPack Media` client carries both
a **WolfPack Media** agent and a **JC Electronics Distro** agent — two unrelated
businesses sharing one tenant.

Per-channel `bot_profile_id` separates the **agents**. It does not separate the
**tenants**.

## What is already done (do not redo)

Shipped on `fix/meta-multi-account-and-routing` (`11e2016`):

- Agent routing fallback is deterministic (`ORDER BY created_at ASC`), matching
  the "Default (\<name\>)" label in Channel Connections.
- `meta-oauth-callback` pins newly connected channels to the client's oldest
  active agent, scoped `bot_profile_id IS NULL` so a manual assignment is never
  clobbered.
- A second Meta account can now be connected: the connect button no longer
  disables once one account is linked, and "Add another Meta account" passes
  `auth_type: 'reauthenticate'` to force Facebook's account chooser.

**Multiple Meta accounts under one client already work.** The remaining gap is
purely that they all share one tenant.

## Key insight that makes this cheaper than it looks

**Inbound routing needs no changes.** `meta-direct-webhook` already resolves the
tenant from the channel row:

```
pageId → wpm_client_channels → client_id → agent
```

Every inbound message is already correctly scoped to whichever client owns the
Page. Likewise `wpm_clients.owner_user_id` **already permits many clients per
user** — nothing in the schema forbids it, and RLS already grants an owner
access to all of their clients, which is the behaviour we want.

So this is not a data-model rewrite. It is: *let the user create more clients,
pick which one they're looking at, and scope the UI to it.*

## Plan

### Phase 0 — preconditions
1. Confirm App Review approval in the Meta dashboard (Advanced Access, not
   Standard) and verify live delivery is healthy:
   ```sql
   select provider, max(created_at), now() - max(created_at) as age
   from wpm_webhook_events group by provider order by 2 desc;
   ```
2. ~~`main` clean, all pending branches merged and deployed first.~~ Done
   2026-08-21.
3. Snapshot `wpm_clients`, `wpm_client_channels`, `wpm_bot_profiles`.
4. **Resolve the orphan client first.** `wpm_clients` row `91de347d`
   ("WolfPack Media Internal Test") has `owner_user_id IS NULL`, so it matches
   no ownership policy and is invisible to every authenticated user. Phase 1
   starts enumerating clients per user; an unowned row is a puzzle you do not
   want to debug mid-migration. Assign it or delete it.

### Phase 1 — active-client selection
- Add `user_settings.active_client_id uuid REFERENCES wpm_clients(id) ON DELETE SET NULL`.
  (`user_settings` is already per-user and already carries the Inbox/Leads
  `*_last_seen_at` markers, so it is the natural home.)
- `getOwnedWpmClient()` returns the **active** client, falling back to oldest
  when unset — keeps every existing caller working unchanged.
- Add `listOwnedClients()`.

### Phase 2 — client management UI
- A client switcher in the app shell (visible only when the user owns >1, or
  when plan is agency/pro).
- "Add a business" → creates a `wpm_clients` row + its default bot, reusing
  `ensureDefaultBotSetup`.
- Rename / archive.

### Phase 3 — OAuth targeting
- `meta-oauth-callback` accepts an optional `client_id` in the body and
  **validates `owner_user_id` matches the JWT user** before using it. Falls back
  to current behaviour when absent.
- Channel Connections passes the active client.

### Phase 4 — scope the UI
Inbox, Leads, Knowledge Base, Agent Setup, Business Profile, Launch Checklist
and Analytics all filter by active client. Most already take a `clientId`
argument, so this is mostly threading the active one through.

### Phase 5 — badges and realtime
`user_settings.inbox_last_seen_at` / `leads_last_seen_at` are **per user, not
per client**, so unread counts would bleed across businesses. Either make them
per-client (JSONB keyed by client_id, or a small `user_client_settings` table)
or scope the badge query to the active client.

### Phase 6 — data split for existing accounts
The `WolfPack Media` client needs its JC Electronics agent, channels,
conversations and leads moved to a new client. Write it as a one-off,
reviewed migration — not a generic "split tenant" feature.

## Risks and constraints

- **`UNIQUE (provider, provider_channel_id, channel_type)` is global.** A Page
  belongs to exactly one client, ever. Moving a Page between two of your own
  clients needs an explicit move path (update `client_id`) or
  disconnect-and-reconnect. Plan for the move; the error message today
  ("connected to another account") will be confusing when it's *your own* other
  client.
- **Plan caps already count across all clients a user owns**
  (`enforce_channel_limit` / `enforce_bot_limit` join through
  `wpm_clients.owner_user_id`). That is correct for agency billing — keep it.
  Do not re-scope these to per-client without a pricing decision.
- **RLS needs no per-client rule.** An owner *should* see all their clients;
  scoping is an application concern. Adding RLS here would be wrong and would
  break the super-admin path.
- **Do not touch the 10 OAuth scopes** (`pages_show_list`, `pages_messaging`,
  `instagram_manage_messages`, `business_management`, …). Changing requested
  permissions re-opens App Review.

## Verification before calling it done

- Two clients under one login, each with its own Page, each with its own agent.
- A DM to Page A is answered by client A's agent and appears only in client A's
  Inbox; same for B.
- Switching clients changes Inbox, Leads and Knowledge with no bleed.
- Unread badges are per client.
- A non-owner still sees nothing (re-run the RLS probes from 2026-08-15).
- `npm run typecheck` at 0, `deno test supabase/functions/_shared/` green.

---

## Unrelated bug found while auditing this — FIXED

The pricing page and `get_plan_limits` disagreed on AI bot counts: the
`max_bots` CASE was a verbatim copy of the `max_channels` CASE and had never
been adjusted, leaving Growth, Pro and Agency more generous in code than on the
page.

**Fixed in `fa8c8c4`** (migration `20260821052320`), verified per tier against
the live function: starter 1, growth 2, pro 3, agency 10, super admin unlimited.
Nothing further to do here.
