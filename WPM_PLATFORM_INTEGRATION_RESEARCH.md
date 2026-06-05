# WPM Platform Integration Research

Date: 2026-06-05
Repo branch: `feature/wpm-bridge-schema`

## Purpose

Validate platform contracts before continuing production implementation of the WolfPack AI DM Agent bridge.

The key correction from this pass: **Woztell outbound replies should be treated as a BotAPI call, not as a guaranteed synchronous webhook return body.**

---

## 1. Woztell

### Sources checked

- `https://doc.woztell.com/`
- `https://doc.woztell.com/docs/reference/bot-api-reference/`
- `https://doc.woztell.com/docs/reference/message-event-reference`
- `https://doc.woztell.com/docs/reference/member-reference`
- `https://doc.woztell.com/docs/reference/channel-reference`
- `https://doc.woztell.com/open-api-reference`

### Verified: BotAPI authentication

Woztell BotAPI is documented as REST-based.

Auth:

- Primary documented method: `accessToken` query parameter.
- Alternative mentioned: Authorization header as Bearer token.
- `sendResponses` requires scope `bot:sendResponses` or `bot:admin`.

Implementation impact:

- Store Woztell BotAPI token server-side only.
- Recommended Supabase secret name: `WOZTELL_BOT_API_ACCESS_TOKEN`.
- Do not expose token in frontend or response payloads.

### Verified: outbound text response path

Woztell BotAPI has a documented **Send Responses** API:

```http
POST https://bot.api.woztell.com/sendResponses
Content-Type: application/json
```

Required/allowed request fields:

- `channelId` — required, Woztell Channel ID.
- `memberId` — optional if `recipientId` is provided; Woztell Member ID.
- `recipientId` — optional if `memberId` is provided; integration recipient ID, such as Facebook PSID or WhatsApp phone number. Docs warn this is not guaranteed and integration-specific.
- `response` — required array of response objects.

Documented text response example:

```json
{
  "channelId": "5ece50e72efaabd58ef55027",
  "memberId": "5ece50f3bf385b25c4e08db5",
  "recipientId": null,
  "response": [
    { "type": "TEXT", "text": "Hello World" }
  ]
}
```

Documented response behavior:

- HTTP 200 if bot execution starts.
- Success body contains `ok: 1`, `member`, and `sendResult`.
- Failure before bot execution may return HTTP 500 with `ok: 0`, `err_code`, and/or `error`.

Implementation impact:

- Current `woztell-webhook/index.ts` returns `createWoztellTextResponse(...)` in the HTTP response body.
- That should be changed to:
  1. receive webhook
  2. normalize/persist/generate AI reply
  3. call `POST https://bot.api.woztell.com/sendResponses`
  4. store send result
  5. return plain `{ ok: true }` / 200 to Woztell

### Verified: message event abstraction

Woztell's Message Event reference says:

- `this.messageEvent` represents member actions.
- Shape differs by platform.
- Common fields across platforms include:
  - `this.messageEvent.type`
  - `this.messageEvent.data`
- `this.messageEvent.data.text` is used in the docs as a common text access pattern.

Facebook section fields include:

- `data` object
- `from` string — PSID of user
- `messageId` optional
- `origin` optional
- `timestamp` epoch ms
- `to` string — Page ID
- `type` string — values include `TEXT`, `PAYLOAD`, `REFERRAL`, `DELIVERY`, `ECHO`, `READ`, etc.

Implementation impact:

- Normalizer must support Woztell-native event shapes in addition to raw Meta webhook shapes.
- Current normalizer supports Meta-style `entry[0].messaging[0]` fixtures, but may not fully support Woztell-native `messageEvent`, `member`, and `channel` wrapper shapes.

### Verified: member object fields

Woztell Member reference says `this.member` includes:

- `_id` — Woztell member primary key.
- `externalId` — member ID in third-party database.
- `app` — organization/app ID.
- `channel` — channel ID.
- `platform` — channel/platform.
- `botId` — integration-specific ID.
- `firstName`, `lastName`, `locale`, `profilePic`, etc.

Implementation impact:

- Prefer `member._id` as `external_customer_id` where available.
- Store `member.externalId` as provider recipient ID / secondary identifier.
- Store `channel._id` as Woztell channel ID.

### Verified: channel object fields

Woztell Channel reference says `this.channel` includes:

- `_id` — channel primary key.
- `app` — app/org ID.
- `name` — channel name.
- `type` — platform/channel type, e.g. Facebook, WhatsApp.
- `info` — platform-specific info.

Facebook channel info includes:

- `pageId`
- `accessToken`
- `name`
- `subscribed`

Implementation impact:

- `wpm_client_channels.provider_channel_id` should map to Woztell `channel._id`.
- `external_page_id` should map to Facebook/Instagram page/account IDs when present.
- Never store or return platform access tokens except as secrets.

### Verified: OpenAPI channel webhook management exists

Woztell OpenAPI reference is GraphQL at:

```text
https://open.api.woztell.com/v3
```

Docs list channel mutations including:

- `updateChannelEnvironmentWebhooks`
- `updateChannelIncomingWebhooks`

Rate limits shown in docs include examples such as:

- `updateChannelEnvironmentWebhooks`: 60 calls/app/minute
- `updateChannelIncomingWebhooks`: 5 calls/app/minute

Implementation impact:

- WPM can eventually automate channel webhook configuration using OpenAPI, but MVP can configure Woztell manually.
- Do not assume OpenAPI is necessary for message reply; BotAPI is the direct outbound reply path.

### Not yet verified

These still require either Woztell workspace access or a controlled test webhook:

1. Exact HTTP payload Woztell sends to an external webhook/action.
2. Whether a Woztell “incoming webhook”/action can include `member`, `channel`, and `messageEvent` in the posted JSON by default or must be manually mapped inside a Woztell node/action.
3. Whether Woztell has any mode where synchronous HTTP response body is sent back to the user. The BotAPI docs confirm `sendResponses`; they do not prove synchronous response replies work.
4. Retry behavior for failed external webhooks.
5. Signature/verification token behavior for incoming external webhooks.
6. Production channel-specific constraints, especially WhatsApp template/24-hour rules.

---

## 2. Meta / Instagram / Facebook / WhatsApp

### Sources checked

- `https://developers.facebook.com/docs/messenger-platform/webhooks`
- `https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api`

Terminal/browser could load the pages, but full content extraction was limited. Current implementation should rely on Woztell as abstraction first.

### Implementation stance

- Treat Meta payload support as secondary fallback.
- Primary production contract should be Woztell-native `messageEvent` + `member` + `channel` if Woztell can post those to our webhook.
- Keep Meta-style normalizer paths because they are still useful for direct Meta integrations or Woztell pass-through payloads.

---

## 3. OpenAI

### Source access status

`https://platform.openai.com/docs/api-reference/responses` was Cloudflare-blocked in this environment during this pass.

### Implementation risk

Current helper is named generically but uses a chat-completion-style request/response shape:

- model
- messages
- choices[0].message.content

Earlier product decision was to use OpenAI Responses API rather than deprecated Assistants API.

Implementation impact:

- Before production AI launch, replace/extend `wpm_ai.ts` with a true Responses API adapter.
- Store provider response ID and usage consistently.
- Keep provider abstraction so WPM can add xAI/Grok or other providers later.

---

## 4. Zapier / webhooks

### Source access status

Zapier docs were Cloudflare-blocked in this environment.

### Implementation stance

- Current `wpm_actions.ts` safely queues and executes generic HTTPS webhook actions.
- It resolves webhook URLs from server-side env `secret_reference`.
- It stores HTTP status, response body, error, and latency.

Remaining validation:

- Confirm Zapier catch hook success response shape.
- Confirm retry/replay behavior.
- Decide whether WPM should sign outbound webhook requests.

---

## 5. Supabase Edge Functions

### Source checked

- `https://supabase.com/docs/guides/functions`

### Current state

- `woztell-webhook` deployed with `--no-verify-jwt`, which is correct for external webhooks.
- `OPENAI_API_KEY` was not set at time of earlier deployment, so live function falls back unless key is added.
- Latest lead/action code has not been redeployed yet.

---

## Required code changes before next deployment

Priority order:

1. Add a Woztell BotAPI client helper:
   - builds text response payload: `{ channelId, memberId/recipientId, response: [{ type: 'TEXT', text }] }`
   - calls `POST https://bot.api.woztell.com/sendResponses`
   - supports token as Bearer or query parameter, default Bearer if accepted in real test.
   - stores sanitized send result.

2. Expand normalizer for Woztell-native payloads:
   - `messageEvent.type`
   - `messageEvent.data.text`
   - `messageEvent.from`
   - `messageEvent.to`
   - `member._id`
   - `member.externalId`
   - `channel._id`
   - `channel.type`

3. Change `woztell-webhook/index.ts` success path:
   - do not rely on HTTP response body to send a user message.
   - call BotAPI sendResponses after AI reply.
   - return HTTP 200 ack to Woztell.

4. Add database storage for outbound send result if current `wpm_messages.metadata` is not enough.

5. Add test fixtures for Woztell-native payloads.

---

## MVP operating decision

Until a live Woztell test confirms otherwise, assume this production flow:

```text
Customer DM
  -> Woztell receives channel event
  -> Woztell posts/makes action call to WPM Supabase webhook
  -> WPM normalizes/persists/generates AI reply
  -> WPM calls Woztell BotAPI sendResponses
  -> Woztell sends message to Instagram/Facebook/WhatsApp
  -> WPM returns HTTP 200 ack to Woztell
```

Do **not** assume synchronous webhook response body is delivered to the customer.
