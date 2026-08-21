# WhatsApp via the Meta Cloud API — plan

> **STATUS: PLANNED, NOT STARTED.** Written 2026-08-21, after Woztell was
> removed. Nothing here is urgent; Facebook and Instagram both work.

WhatsApp arrives through Meta directly — the same app, the same webhook
endpoint, the same Graph API. It is **not** a third-party provider, which is why
dropping Woztell does not cost us anything here and why this is cheaper than it
looks.

---

## What already exists

Genuinely more than you would expect:

| Piece | State |
| --- | --- |
| `wpm_client_channels.channel_type` | Already accepts `'whatsapp'` — `WpmChannelType` has carried it since June |
| `wpm_client_channels.external_phone_number` | Column exists, indexed, unused |
| `meta-direct-webhook` | Already receives Meta webhooks, verifies `X-Hub-Signature-256`, and dispatches on `object` |
| The reply pipeline | `normalize → persist → AI reply → send → lead extraction` is provider-agnostic below the normalizer |
| Usage caps, handoff, leads, Inbox | All key off `conversation_id`, not the channel kind |

So the work is a new **normalizer** and a new **sender**, plus connect UI. The
pipeline in between is untouched.

## The one thing that will bite

`meta-direct-webhook` currently decides platform like this:

```ts
const platform: 'messenger' | 'instagram' =
  objectType === 'instagram' ? 'instagram' : 'messenger';
```

Anything that is not `'instagram'` is treated as Messenger. WhatsApp sends
`object: 'whatsapp_business_account'`, so **the day you subscribe the app to
WhatsApp webhooks, those deliveries start being parsed as Messenger events** —
and they will not throw. They will silently produce zero events, because the
payload shape is different:

- Messenger / Instagram: `entry[].messaging[]`
- WhatsApp: `entry[].changes[].value.messages[]`, with the sender in
  `value.contacts[].wa_id` and the display name in `value.contacts[].profile.name`

The failure mode is the one this codebase keeps producing: a 200, nothing
written, no error. **Make the dispatch exhaustive before subscribing to
anything**, so an unrecognised `object` is recorded rather than guessed at.

## Phases

### Phase 0 — prerequisites
1. A WhatsApp Business Account with a phone number, and the number registered to
   the Cloud API. A number already in use by the WhatsApp *app* must be migrated
   and cannot be used by both.
2. App Review for `whatsapp_business_messaging` and
   `whatsapp_business_management`. **This re-opens App Review**, so do not start
   it in the middle of anything else that depends on the current approval.
3. Decide who pays. WhatsApp is billed per 24-hour conversation window by Meta,
   unlike Messenger and Instagram which are free. This has a pricing-page
   consequence and should be settled before the code exists.

### Phase 1 — make the dispatch honest
Replace the two-way ternary with an explicit map, and record unknown object
types to `wpm_webhook_events` with `status = 'ignored'` and a reason. Ship this
**before** Phase 0 completes — it is useful on its own and it is what makes the
rest debuggable.

### Phase 2 — normalizer
`_shared/wpm_whatsapp.ts`, mirroring the shape `normalizeMetaEvents` returns so
it drops into the existing pipeline:

- Text, image, audio, document, location, button and interactive replies
- `value.contacts[].profile.name` → `external_user_name` — **note WhatsApp gives
  you the display name in the webhook payload itself**, so unlike Messenger
  there is no profile lookup and no name problem
- `value.statuses[]` (sent / delivered / read) must be skipped, the same way
  echoes and delivery receipts are skipped today
- `wa_id` → `external_user_id`, phone number ID → channel lookup

Unit-test it against captured real payloads, as `wpm_meta_api_test.ts` now does.

### Phase 3 — sender
`sendWhatsAppMessage()` posting to `${GRAPH_API_BASE}/{phone_number_id}/messages`.
Same token handling as the Page token: per-channel, stored at connect time.

**The 24-hour window is the real constraint.** Outside it you may only send an
approved template, not free text. The AI reply path must check the window and
degrade gracefully rather than firing a request that Meta rejects. Decide what
"gracefully" means — most likely: queue as a handoff for a human, rather than
silently dropping.

### Phase 4 — connect flow
Meta's Embedded Signup, not the plain OAuth dialog. It returns the WABA ID and
phone number ID. Channel Connections gains a WhatsApp card alongside Facebook
and Instagram; the channel row stores `external_phone_number` and the phone
number ID in `provider_channel_id`.

### Phase 5 — surface
Inbox already renders any channel type; `CHANNEL_PERSON_LABEL` in `Inbox.tsx`
already has a `whatsapp` entry. Needs a WhatsApp icon and colour, and the plan
caps decision from Phase 0 reflected in `get_plan_limits`.

## Sequencing against the other open work

Do **agency multi-tenancy first.** It changes how channels attach to clients,
and doing that after a third channel type exists means migrating three kinds of
channel instead of two. WhatsApp also re-opens App Review, which the
multi-tenancy work explicitly wants to avoid touching.

## Verification before calling it done

- A WhatsApp message to the business number is answered by the right client's
  agent and appears in that client's Inbox with the sender's real name.
- A message outside the 24-hour window does not silently vanish.
- Status callbacks (delivered / read) do not create phantom conversations.
- An unknown webhook `object` is recorded, not guessed at.
- Facebook and Instagram are provably unaffected — same regression suite green.
