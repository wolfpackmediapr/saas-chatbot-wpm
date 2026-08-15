# Agency multi-tenancy — deferred plan

> **STATUS: BLOCKED ON META APP REVIEW. DO NOT START THIS YET.**
>
> **Trigger to begin:** Meta grants **Advanced Access** on `pages_messaging` and
> `instagram_manage_messages` (App Review approved). Until then this document is
> a plan only — no schema, no UI, no OAuth changes.
>
> **Why the gate:** the work below changes how Pages are attached to accounts and
> how OAuth resolves its target. Meta's review evaluates the live app and its
> permission usage; reshaping the connect flow mid-review risks a rejection that
> costs far more time than the feature saves. Nothing here is urgent — the
> current single-client model works, it just mixes businesses together.

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
2. `main` clean, all three pending branches merged and deployed first.
3. Snapshot `wpm_clients`, `wpm_client_channels`, `wpm_bot_profiles`.

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

## Unrelated bug found while auditing this (2026-08-15)

**The pricing page and `get_plan_limits` disagree on AI bot counts.**

| Plan | Pricing page | `get_plan_limits` |
|---|---|---|
| Starter | 1 AI bot | 1 ✅ |
| Growth | 2 AI bots | **3** ❌ |
| Pro | 3 AI bots | **10** ❌ |
| Agency | 10 AI bots | **NULL (unlimited)** ❌ |

Channel counts all match. The `max_bots` CASE is a verbatim copy of the
`max_channels` CASE — same `10 / 3 / 1 / NULL` arms — so the bot numbers were
never adjusted after the copy.

Direction matters: unlike the Delete-Account button, the confirmation email and
the 7-day trial, here the **code is more generous than the page**. So this is
not a false-advertising exposure — it is revenue leakage, and it means the
Agency tier's "10 AI bots" is not actually a differentiator over Pro.

Fix is a one-line-per-arm edit to `get_plan_limits`, but it **reduces** limits
for anyone already on Growth or Pro, so check current usage before applying:

```sql
select c.owner_user_id, count(*) filter (where bp.is_active) as active_bots
from wpm_bot_profiles bp join wpm_clients c on c.id = bp.client_id
group by c.owner_user_id having count(*) filter (where bp.is_active) > 3;
```

Independent of Meta approval — can be done any time.
