# Credits System — plan, not yet started

**Status:** deliberately deferred, 2026-08-25.
**Decision:** build the 7-day trial + TrialBar now; revisit credits when there
are paying customers and real usage data to price against.

---

## Why this was deferred rather than rejected

Credits genuinely fit the cost shape of this product. Today's meters —
messages for free accounts, conversations for paid — both assume every unit
costs the same. They do not:

| Action | Real cost driver |
| --- | --- |
| A text reply | OpenAI prompt + completion tokens |
| A voice note | Whisper transcription **plus** the reply |
| An image | Vision tokens, materially more than text |
| A shared reel with a long caption | A much larger prompt |
| A human Inbox reply | Nothing — no model call at all |

A 4,000-character knowledge base makes every reply on that account more
expensive than one with 200 characters, and nothing today reflects that.

Credits would also solve **overage, which the pricing page already advertises
and nothing implements**. That gap is real and is documented in
`_shared/wpm_usage.ts`.

## Why not now

The binding constraint is **conversion, not monetization sophistication**. As of
2026-08-25 there are zero external signups. Nothing about a credits system makes
someone convert who currently does not, and it would be a large project:

- A ledger table (`wpm_credit_ledger`) — append-only, one row per debit/credit
- Stripe top-ups and balance sync, on top of the existing subscription flow
- Migrating four plans plus the comped `agency` accounts
- Rewriting the pricing page, landing page, and free-tier copy again
- A real UX problem: "how many credits is a conversation?" is a question
  customers should never have to ask

Building this before there is usage data also means **guessing the exchange
rate**, which is the one number that must not be wrong.

---

## Design sketch, for when it is time

### Ledger, not a counter

One append-only table. A balance is `sum(delta)`, never a mutable integer —
a stored balance drifts the first time two writes race, and there is no way to
audit how it got where it is.

```sql
create table public.wpm_credit_ledger (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.wpm_clients(id) on delete cascade,
  delta        integer not null,          -- negative = spend, positive = grant/top-up
  reason       text not null,             -- 'ai_reply' | 'transcription' | 'vision' | 'topup' | 'grant' | 'refund'
  conversation_id uuid,                   -- null for top-ups
  message_id   uuid,                      -- what was charged, for disputes
  metadata     jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
```

Index on `(client_id, created_at desc)`. Balance comes from a `SECURITY DEFINER`
function mirroring `get_wpm_usage` — **and note the trap that function already
taught us: `CREATE FUNCTION` grants EXECUTE to PUBLIC by default, so any new
RPC must explicitly `revoke execute ... from public, anon`.**

### Pricing the units

Do not invent these. Derive them from `wpm_messages.token_usage`, which has
been recorded all along:

```sql
select
  percentile_cont(0.5) within group (order by (token_usage->>'total_tokens')::int) as median,
  percentile_cont(0.95) within group (order by (token_usage->>'total_tokens')::int) as p95
from wpm_messages where role = 'assistant' and token_usage is not null;
```

Set 1 credit ≈ a median text reply, then price the heavier actions as multiples
of the measured ratio. Publish the table; never make customers guess.

### Charging

Debit **after** a successful send, in the same place delivery status is now
recorded in `meta-direct-webhook/index.ts`. Never charge for:

- A reply Meta rejected (code 10, outside the 24-hour window)
- A human Inbox reply — no model call happened
- An `ignored` webhook event (empty Instagram card, unhandled attachment)

Charging for undelivered work is the fastest way to lose trust, and until the
2026-08-25 delivery-status change there was no way to tell delivered from not.

### The fail-open rule stays

`checkConversationAllowance` currently returns `{ allowed: true }` on any error.
Keep that. A credits lookup that throws must never silence a paying customer's
agent — the same reasoning that already governs the usage check.

---

## Open questions to settle before writing code

1. **Do credits expire?** Subscription credits usually reset monthly; purchased
   top-ups usually do not. Two pools with different rules is the honest answer
   and the harder UI.
2. **What happens at zero?** Hard stop, or a grace overdraft? The existing
   handoff notice (`USAGE_CAP_NOTICE`) already covers the customer-facing side.
3. **Do plans become credit bundles, or keep their caps with credits only for
   overage?** The second is far less disruptive and probably the right first
   step.
4. **Refunds.** A `refund` reason exists in the sketch above; decide who can
   issue one and whether it needs an admin UI.

## Prerequisites

- Real paying customers with at least a month of `token_usage` data
- The Stripe live path proven end to end with a real card (still outstanding
  as of 2026-08-25)
- Overage policy decided — see the warning in `_shared/wpm_usage.ts` about
  billing paid overage on conversations, or filtering `role = 'human'`, so
  customers are never charged for their own staff typing
