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

---

## xAI / Grok Build note

### Sources checked

- xAI public docs via `https://docs.x.ai/llms.txt` and linked docs pages.
- Local tool availability: `grok` CLI was not installed in this environment.
- Local environment: `XAI_API_KEY` was not set.

### Current decision

Do **not** make xAI/Grok the primary build or runtime path for this MVP.

Rationale:

- The current bridge is already wired around Supabase Edge Functions and OpenAI server-side calls.
- Grok Build requires installing/authenticating the xAI CLI or supplying `XAI_API_KEY`; neither is currently configured.
- Adding a second runtime provider before live Woztell validation would increase QA surface and delivery risk.

### Recommended backlog item

After the MVP loop is proven, add xAI as an optional provider behind feature flags:

- `provider: 'openai' | 'xai' | 'gemini'`
- server-side-only `XAI_API_KEY`
- `store: false` for xAI Responses API calls where supported
- tenant-level provider/model config
- evals against WPM DM qualification scenarios before client use

Most promising WPM differentiator: Grok/xAI social intelligence and X Search context for public brand/social monitoring, not basic DM response generation.
 
 ---
 
 ## 6. Woztell vs. Direct Meta Strategy + Unified Inbox (added 2026-06-06)
 
 ### What Woztell actually does (detailed)
 
 Woztell is an **official Meta Business Partner and WhatsApp Business Solution Provider (BSP)**. It is not just "another WhatsApp tool" — it is a full **omnichannel conversational middleware + no-code bot builder + team operations platform** sitting on top of:
 
 - WhatsApp Cloud API (and historically On-Premises)
 - Instagram Professional Messaging (Graph API)
 - Facebook Messenger
 - Webchat
 
 Core value it provides to a product like WPM AI DM Agent:
 
 - **Channel abstraction**: Single concept of a "Channel" (with `channel._id`, `type`, `info`, `member`) that normalizes WhatsApp / IG / FB differences.
 - **Reliable inbound delivery**: Clients configure "Actions" / incoming webhooks inside Woztell per channel. Woztell posts normalized (or raw) events to our `woztell-webhook` Edge Function.
 - **Reliable outbound via BotAPI**: We call `POST https://bot.api.woztell.com/sendResponses` with `channelId` + `response` array (text, templates, rich media). Woztell handles the actual delivery to Meta.
 - **Compliance & ops heavy lifting**:
   - WhatsApp template management & approval
   - 24-hour customer service window rules
   - Quality rating / tier management for WhatsApp numbers
   - Token rotation and long-lived access for Pages/IG
   - Rate limit handling
 - **No-code builder + AI hooks**: Visual dialogue trees + native ChatGPT integration (nice for clients who want hybrid no-code + our AI).
 - **Unified team inbox / live chat / ticketing**: This is the big one clients will eventually demand (see below).
 
 Woztell charges its own platform fees **on top of** Meta's per-conversation / per-message fees.
 
 ### How channels are created in Woztell
 
 1. Client logs into their Woztell workspace.
 2. Goes to Channels (or Integrations) section.
 3. **WhatsApp**:
    - Woztell (as official BSP) guides them through number registration / migration to Cloud API.
    - Much easier than going direct to Meta.
 4. **Instagram DMs / Facebook**:
    - Connect via standard Meta OAuth: authorize Woztell's app (or a custom app) to the Professional IG account or FB Page.
    - Permissions typically include `pages_messaging`, `instagram_basic`, `instagram_manage_messages`, etc.
    - Woztell stores the Page access token server-side in the channel `info` object (never exposed to end users).
 5. Once connected, every channel gets a stable Woztell `channelId` (the `_id` we store in `wpm_client_channels.provider_channel_id`).
 6. Client configures an "Action" or "Incoming Webhook" on that channel pointing to our Supabase function URL + (optionally) signs/validates.
 
 Current WPM implementation (ChannelConnections.tsx + wpmClients.ts):
 - Self-serve flow is **"bring your own Woztell channel ID"**.
 - User pastes the Woztell channel ID (or phone/handle) after they have set it up on the Woztell side.
 - We store `provider`, `provider_channel_id`, and metadata.
 - This is pragmatic for MVP. Full white-label / automated provisioning would require Woztell partner API + reseller agreement.
 
 ### How Woztell connects to Meta
 
 - Woztell maintains Meta Business Manager relationships and approved Apps.
 - For FB/IG: Standard Meta app review + OAuth flow from the client's Page/IG account to Woztell's app.
 - For WhatsApp: As a BSP, Woztell has higher-tier access and can onboard numbers faster with less friction for the end business.
 - All raw Meta webhooks land in Woztell first → they normalize into their `messageEvent` + `member` + `channel` model → forward to external systems (us).
 - Outbound always goes through Woztell BotAPI (we never talk directly to Meta Graph API in the current bridge).
 
 This is why our normalizer (`woztell.ts`) has paths for both Woztell-wrapped events and raw Meta `entry[0].messaging[0]` shapes.
 
 ### Bypassing Woztell — what you actually need
 
 **Yes — you would need your own Meta App(s).**
 
 #### For Instagram + Facebook Messenger (relatively straightforward)
 - Create a Meta App at developers.facebook.com (Business type).
 - Add the Messenger and/or Instagram products.
 - Go through app review for the required permissions (`pages_messaging`, `instagram_manage_messages`, etc.).
 - Implement OAuth + Page/IG account selection in your own onboarding flow.
 - Set up your own webhook endpoint directly at Meta (instead of Woztell forwarding).
 - Outbound via Graph API `/{page-id}/messages` or Instagram equivalent.
 - You store/manage the Page access tokens (encrypted, server-side only).
 
 #### For WhatsApp (much harder)
 Two realistic paths if you want to remove Woztell:
 
 1. **Use another official BSP** (Twilio, 360dialog, MessageBird, Bird, etc.). Still a third party, but different pricing/contracts.
 2. **Direct WhatsApp Cloud API (self-serve)**:
    - Business verification in Meta Business Suite.
    - Phone number registration / migration (you own the number or use a hosted one).
    - Submit and get approval for every message template.
    - Implement the full 24h session + template rules yourself.
    - Handle quality ratings (if your number quality drops, delivery is throttled).
    - You become responsible for support SLAs that Meta/BSPs normally absorb.
 
 **Reality check for WolfPack**:
 - Bypassing is **not** "just make a Meta App". WhatsApp in particular has significant ongoing operational cost and risk.
 - Early stage: **Strongly recommend staying on Woztell** (or similar BSP). It lets the product focus on the AI intelligence, qualification, automations, and self-serve setup — the actual differentiator.
 - Future options:
   - Offer a "Direct / Self-hosted delivery" higher tier (client brings their own BSP keys or Meta tokens).
   - White-label Woztell (partner program) so the client never sees the Woztell brand.
   - Become a reseller of Woztell channels.
 
 ### Unified Inbox requirement (eventually mandatory)
 
 Clients will not be happy with "AI handles everything and you only see leads" forever. They will want (and competitors like Woztell provide out of the box):
 
 - A single real-time view of **all** conversations across WhatsApp + Instagram (and future channels).
 - Filter by status (AI-handled, needs human, resolved).
 - Ability to **take over** a conversation from the AI (respecting the handoff rules we already have in bot instructions).
 - Agent assignment, internal notes, quick replies.
 - Full message history with clear "AI" vs "Human" labels and which model/prompt was used.
 - Escalation notifications (Slack, email, in-app).
 
 Current WPM pieces that are the foundation:
 - `wpm_messages` (or the messages we persist in the bridge)
 - `wpm_leads`
 - `wpm_tool_executions` (for automations)
 - The existing Leads page + future Chat view
 
 **Recommended approach**:
 - Phase 1 (MVP): Good lead capture + basic conversation history in Leads or a new "Conversations" tab.
 - Phase 2: Lightweight unified inbox (list + detail view + manual reply button that calls the same BotAPI path).
 - Phase 3: Full agent workspace with presence, assignment, SLA timers, etc.
 
 This is a major product feature and should be priced into higher tiers (Professional/Enterprise) or as an add-on.
 
 ### Current recommendation for WPM product
 
 - **MVP (now)**: Keep Woztell as the channel + delivery layer. Document clearly in onboarding that clients need a Woztell workspace + channels (we can later offer "we'll set it up for you" service or reseller flow).
 - Expose the channel ID paste UX (already done in ChannelConnections) and improve the copy to explain the relationship.
 - Price tiers should include a line item or note about "delivery platform fees (Woztell + Meta) are separate or bundled depending on plan".
 - Treat "Direct Meta / bring your own BSP" as a **future Enterprise feature** (reduces variable costs for high-volume clients).
 - Plan the unified inbox as a post-MVP but high-priority item once the core AI DM loop + public marketing site + pricing are live.
 
 This keeps the engineering surface manageable while still being honest about the architecture.
 
 ---
 
 ## 7. Open questions / next research items
 
 - Exact current Woztell pricing for BSP channels + per-message markups (not in public docs; requires sales conversation).
 - Whether Woztell offers white-label / reseller programs with revenue share.
 - Cost comparison table: Woztell vs. Twilio vs. direct Cloud API at different monthly message volumes.
 -
 ## 6.1 Deep Dive on Specific Woztell Docs (June 2026 links provided by user)

 The following is based on direct analysis of the four provided documentation pages (with full snapshots, UI descriptions, and screenshots).

 ### Navigation (get-started/navigation)
 - The platform has a clear top-level navigation with these key areas:
   - **Inbox**: Built-in unified live chat / support system. "Enables you to seamlessly integrate with any of your existing channels... provide instant live chat support without the need to switch between different applications." This is exactly the unified inbox experience the user mentioned needing eventually in WPM.
   - **Channels**: Primary place to select and manage messaging platforms for deployment.
   - **Broadcast**: Send notifications to groups.
   - **Members**: Subscriber profiles + conversation history.
   - **Dashboard**: Analytics.
   - **Builder** (core section):
     - Bot Builder (trees + nodes)
     - Data Sources (mini DBs)
     - Media Library
     - Logs (for debugging)
     - Bot Languages, Triggers, Responses, Actions (resource templates — Actions are especially relevant for calling external webhooks like our bridge)
   - **Marketplace**: Extensions, installed items, and chatbot templates.
   - **Settings**: General, Account, Access Tokens (important for BotAPI).
 - This structure shows Woztell positions itself as a complete operations platform, not just a connector.

 ### Bot Builder Workspace (bot-builder/workspace)
 - Central canvas for constructing conversation flows.
 - Everything is organized around **Trees** (modular conversation flows). Recommendation in docs: create separate trees for different flows (e.g., Q&A vs Chit-chat) instead of one giant tree.
 - **Tree Manager** (sidebar): Create, duplicate, delete, export trees.
 - Export supports multiple trees at once and is useful for moving campaigns between accounts.
 - The workspace itself is the visual editor where you build by adding nodes.
 - Visual: Centered workspace area with tree list on the side; clear "Create Tree" flow with name + description.

 ### Bot Builder Node (bot-builder/node)
 - Fundamental building block: A "Node" is a set of message response(s) triggered by a path + trigger.
 - Node types:
   - **General Node / Tree Node**: Basic path-based nodes in the workspace canvas.
   - **Global Node**: Can be triggered from anywhere (not just following the tree path). Use cases: persistent menu, repeated buttons, URL parameters leading to same destination.
   - **Transformer Node**: Special — does **not** send messages. Instead, it transforms/modifies the incoming event, then re-matches nodes. Great for preprocessing, adding context, or custom logic. Notes in docs about priority and redirect behavior.
   - **Global Transformer Node**: Global version of the above.
 - **Node Drawer**: Top section below main menu for managing/searching Global Nodes. Search by name/description; clicking highlights the node and shows details.
 - Building flow: Create nodes in the workspace, connect via paths/triggers.
 - Relevance to WPM: Transformer nodes and Actions are natural integration points. Our AI could live as a sophisticated "Transformer + Response" or entirely replace static node trees for intelligent qualification + handoff.

 ### Channels Overview (channels/channels-overview)
 - **Channels page** is a table view showing existing channels with:
   - Platform icons (WhatsApp Cloud green phone, Facebook blue f, Instagram gradient, Web Chat, Slack).
   - Name, Platform, # of Chatbots, # of Global Nodes.
   - Edit and "..." (More) actions.
   - "New Channel" primary button (blue/purple in UI).
   - Toggle for "Show Archived".
 - **List of Supporting Platforms** (with logos and links):
   - WhatsApp Cloud + WhatsApp Business API
   - Facebook
   - Instagram
   - Web Chat
   - Slack
 - Key fact: "Each channel can be connected to **one platform only**".
 - **Channel Info** (shown in modal/screenshot):
   - **Channel ID**: Unique identifier. Used in Woztell API or web chat. (This is the value our ChannelConnections.tsx currently asks the client to paste.)
   - **Channel Secret**: Explicitly "can be used as a secret key for webhook event validation." Critical for secure external integrations (our bridge can eventually validate against this).
   - Channel Name and Description (self-defined).
 - Management:
   - Remove = "More" > "Remove" → moves to archived (not hard delete).
   - Archived view via "Show Archived" toggle; archived channels shown with strikethrough or different styling in screenshots.
 - Platform-specific sub-docs exist for WhatsApp, Facebook, Instagram (these would detail the Meta OAuth / BSP flows).
 - Visual layout (from provided screenshots):
   - Top nav bar with Woztell logo, quick links (Channels active), "Upgrade" button.
   - Left sidebar: Organization settings + Channels menu expanded to sub-items (Overview, Incoming Webhooks, Environment, Chatbot Settings, Webhooks, etc.).
   - Main content: Channel list table + "New Channel" CTA.
   - Channel creation/info modals are clean forms showing the generated Channel ID + Secret prominently.
   - Platform selection uses branded logos in a clean table or grid.

 **Strategic takeaways from these pages**:
 - Woztell's primary client value is the polished **no-code Bot Builder** (trees + nodes + global/transformer logic) + the **Inbox** for human agents.
 - Our WPM AI DM Agent is the "intelligent brain" that can power responses/actions inside or instead of their node trees.
 - Integration surface is clear: Channel ID + (optionally) Secret for webhooks/Actions.
 - Bypassing Woztell means the client loses the entire visual builder, the unified Inbox, channel management UI, broadcast tools, etc. They would need equivalent (or better) experiences inside WPM.
 - For the public marketing site: Accurate positioning could be "AI that makes your Woztell channels (or direct Meta channels) dramatically smarter" or "Full self-serve AI DM agent with optional Woztell-powered delivery + human inbox".
 - The Channel Secret mention strengthens the case for future secure webhook validation in our edge functions.
