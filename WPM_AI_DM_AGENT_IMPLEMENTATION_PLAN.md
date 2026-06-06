# WolfPack AI DM Agent Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task once Wilfre approves execution.

**Goal:** Convert the existing Bolt/GitHub app into the production WolfPack AI DM Agent platform using the live Bolt Supabase project `sb1-gbfmr9wd` / ref `upthfjkxbsqtipzoeecd` as the source-of-truth database.

**Architecture:** Keep the current React/Vite app as the admin/setup dashboard, but move AI execution, Woztell handling, secrets, Zapier/webhook calls, lead capture, and logs into a WPM Bridge backend layer. Replace deprecated OpenAI Assistants API / Assistant IDs with OpenAI Responses API, client profiles, bot instructions, knowledge sources, server-side tools, and normalized Woztell responses.

**Tech Stack:** React, Vite, TypeScript, Supabase Auth, Supabase Postgres, Supabase Edge Functions or backend API routes, OpenAI Responses API, Woztell webhooks, Zapier/webhooks, GitHub repo `wolfpackmediapr/saas-chatbot-wpm`, live Supabase project `upthfjkxbsqtipzoeecd`.

---

## Non-Negotiable Target Context

Use this Supabase project:

- Project name: `sb1-gbfmr9wd`
- Project ref: `upthfjkxbsqtipzoeecd`
- Supabase URL: `https://upthfjkxbsqtipzoeecd.supabase.co`
- Region visible in screenshot: East US / North Virginia
- Branch: `main`
- Environment: `PRODUCTION`
- Last migration visible: `make_assistant_id_optional`

Do **not** implement against `bujaynemskuzziclsasq` for this app unless Wilfre explicitly reverses this decision.

---

## WPM Business Alignment Guardrails

This plan must stay anchored to WolfPack Media's real offer and business model, not drift into a generic chatbot SaaS.

Verified/public WPM positioning from `wolfpackmediapr.com`:

- WolfPack Media Agency is positioned around digital solutions and AI innovation.
- Public services include AI-powered web design, app development, SEO, and video production.
- The AI DM Agent should therefore sell as a WPM-built business system: automated DM response, lead capture, booking/CRM routing, and monthly optimization — not as a standalone toy chat UI.

Operational guardrails:

1. **Do not build random app screens before the live revenue loop works.** The first proof is Woztell inbound → WPM bridge → model reply → Woztell BotAPI outbound → lead/action logs.
2. **Self-setup and self-operation are the product goal.** WPM should design the platform so a client can onboard, configure, test, launch, monitor, and route leads without WPM support. WPM support becomes fallback/concierge, not the default operating path.
3. **Automate every repeatable setup step.** If a human would ask for business details, channel IDs, brand voice, FAQs, booking links, Zapier/n8n webhook URLs, or CRM fields, the website should collect/validate/store it through guided setup.
4. **Every dashboard feature must map to autonomous operation:** client onboarding, agent instructions, knowledge, channels, integrations, test conversations, live conversations, leads, launch readiness, health checks, billing/status, or reporting.
5. **Every integration assumption requires vendor due diligence first.** Woztell, Meta, OpenAI, Zapier, n8n, and Supabase behavior must be confirmed with docs and/or live probes before implementation.
6. **Secrets and runtime execution stay server-side.** No browser OpenAI calls, no browser Zapier hook URLs, no client-visible BotAPI tokens.

---

## Current Starting Point

The existing app already has:

- Supabase Auth login/signup.
- Protected dashboard routes.
- Chat UI.
- Bot management UI.
- User settings UI.
- Existing migrations for:
  - `profiles`
  - `user_logs`
  - `user_settings`
  - `chat_threads`
  - `chat_messages`
  - `ai_bots`
- OpenAI Assistants API flow.
- Zapier/HoneyBook prototype function call.

The app must be migrated away from:

- Browser-side OpenAI API calls.
- `dangerouslyAllowBrowser: true`.
- `VITE_OPENAI_API_KEY` for runtime AI execution.
- `VITE_OPENAI_ASSISTANT_ID` as the product model.
- `openai.beta.threads.*` / Assistants API.
- Client-side Zapier webhook URLs.

---

## Self-Setup Operating Model

The platform must be designed as a client-operated setup wizard and operating console. WPM should not be required to configure every client manually.

### Client self-setup flow

1. **Create account / business profile**
   - Business name, industry, website, timezone, contact email, phone, language, brand voice.
   - Auto-create `wpm_clients` row tied to the authenticated user.

2. **Choose agent template**
   - Restaurant, beauty/spa, medical/dental, home services, professional services, ecommerce, or custom.
   - Auto-create `wpm_bot_profiles`, default instructions, qualification rules, handoff rules, and starter FAQ prompts.

3. **Load knowledge**
   - Client can paste FAQs, services, prices, policies, links, files, or website URLs.
   - System turns this into `wpm_knowledge_sources` rows and readiness status.

4. **Connect channels**
   - Website guides client through Woztell/Meta setup.
   - Client enters Woztell channel ID / page ID / WhatsApp info where required.
   - System stores only safe mapping data in `wpm_client_channels`.
   - Tokens stay in Supabase secrets or provider-managed OAuth flow, never in frontend-visible state.

5. **Configure automations**
   - Client selects lead destinations: email, Google Sheet, Airtable, CRM, Zapier, n8n, custom webhook.
   - Website stores integration rows and secret references; server-side functions execute actions.

6. **Test agent before launch**
   - Built-in simulator sends test messages through the same WPM Bridge path.
   - Client sees reply, lead extraction, handoff decision, and automation result.

7. **Launch readiness gate**
   - System checks required client/profile/channel/knowledge/integration/secrets rows.
   - Client cannot mark live until required checks pass.

8. **Operate without WPM**
   - Client can view conversations, leads, failed automations, handoff events, usage, and monthly performance.
   - WPM can retain admin override/support access, but normal use should not require it.

### Self-setup MVP acceptance criteria

The self-setup MVP is done when a new client can, from the website alone:

1. Sign up and create a business/client profile.
2. Select an industry template.
3. Edit bot instructions and lead questions.
4. Add knowledge/FAQ content.
5. Add at least one channel mapping.
6. Add at least one automation destination: Zapier, n8n, custom webhook, or email notification.
7. Run a simulated test conversation.
8. See lead extraction and automation status.
9. See launch blockers and fix them without WPM.
10. Receive real inbound channel messages once Woztell/Meta is connected.

---

## Implementation Strategy

### Keep

- React/Vite app shell.
- Auth pages.
- Protected dashboard layout.
- Existing bot/settings pages as UI foundation.
- Chat/history components as reusable dashboard/test panel pieces.
- Supabase project `upthfjkxbsqtipzoeecd`.

### Replace

- Assistant ID config → bot profiles + instructions + templates.
- Browser OpenAI calls → server-side WPM Bridge endpoint.
- Client-side Zapier calls → server-side integrations/tool execution.
- Chat-only data model → production client/channel/conversation/lead/webhook model.

### Add

- Woztell webhook receiver.
- Payload normalizer.
- Client/channel lookup.
- Responses API wrapper.
- Server-side tools.
- Knowledge source model.
- Lead capture flow.
- Conversation/event/error logs.
- Test conversation panel.
- Setup-person workflow pages.

---

## Phase 0 — Safety, Project Alignment, and Branch Setup

### Task 0.1: Confirm live Supabase project connection

**Objective:** Verify implementation targets `upthfjkxbsqtipzoeecd`, not the wrong Supabase project.

**Files:**
- Read: `.env` or deployment env in Bolt/Supabase dashboard
- Read: `src/lib/supabase/client.ts`
- Do not modify yet.

**Steps:**

1. Confirm Bolt environment variables point to:
   - `VITE_SUPABASE_URL=https://upthfjkxbsqtipzoeecd.supabase.co`
   - correct anon key for `upthfjkxbsqtipzoeecd`
2. Confirm the Supabase dashboard shows last migration `make_assistant_id_optional`.
3. Record the project ref in implementation notes.

**Verification:**

- Live app continues loading login screen.
- Supabase dashboard project title remains `sb1-gbfmr9wd`.
- No code/database changes made.

### Task 0.2: Create implementation branch

**Objective:** Start work without touching `main` directly.

**Files:**
- Git branch only.

**Command:**

```bash
cd /Users/wolfpackmedia/.hermes/audits/saas-chatbot-wpm
git checkout main
git pull --ff-only
git checkout -b feature/wpm-bridge-responses-api
```

**Verification:**

```bash
git branch --show-current
```

Expected:

```text
feature/wpm-bridge-responses-api
```

**Commit:** No commit needed.

---

## Phase 1 — Database Foundation for Productized WPM Bridge

### Task 1.1: Create WPM Bridge migration file

**Objective:** Add production tables required for client/channel/bot/conversation/lead/integration/webhook logging.

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_add_wpm_bridge_schema.sql`

**Tables to create:**

- `clients`
- `client_channels`
- `bot_profiles`
- `bot_instructions`
- `knowledge_sources`
- `conversations`
- `messages`
- `leads`
- `integrations`
- `webhook_events`
- `tool_executions`
- `handoff_events`

**Schema principles:**

- Every client-owned table should include `client_id`.
- Keep raw inbound payloads in `webhook_events.raw_payload` as `jsonb`.
- Store normalized payloads in `webhook_events.normalized_payload` as `jsonb`.
- Store external channel IDs separately from internal IDs.
- Use `status` fields for workflows.
- Use `created_at` and `updated_at` timestamps.
- Enable RLS on all tables.
- Only authenticated WPM users should manage setup/admin data at first.

**Verification:**

- Migration is SQL-valid.
- Existing migrations remain untouched.

### Task 1.2: Add database TypeScript types

**Objective:** Add app-level TypeScript interfaces for the new WPM Bridge tables.

**Files:**
- Modify: `src/lib/supabase/types.ts`
- Create: `src/lib/wpm/types.ts`

**Types to define:**

- `Client`
- `ClientChannel`
- `BotProfile`
- `BotInstructions`
- `KnowledgeSource`
- `Conversation`
- `Message`
- `Lead`
- `Integration`
- `WebhookEvent`
- `ToolExecution`
- `HandoffEvent`

**Verification:**

```bash
npm run build
```

Expected: build succeeds or only pre-existing errors are reported.

---

## Phase 2 — Server-Side WPM Bridge Layer

### Task 2.1: Choose backend execution location

**Objective:** Decide where the WPM Bridge API will run.

**Preferred option:** Supabase Edge Functions because the app already uses Supabase and Woztell webhooks can call HTTPS endpoints.

**Alternative:** Vercel/Netlify/Bolt serverless route if deployment supports it cleanly.

**Decision criteria:**

- Can store OpenAI key server-side.
- Can receive Woztell webhook POST requests.
- Can call Supabase with service role key server-side.
- Can return JSON in Woztell expected format.
- Can be deployed reliably without exposing secrets in frontend.

**Output:**

- Add `docs/architecture/backend-decision.md` documenting the selected runtime.

### Task 2.2: Create Woztell webhook function skeleton

**Objective:** Add the inbound endpoint without AI logic yet.

**Files:**
- Create: `supabase/functions/woztell-webhook/index.ts`
- Create: `src/lib/wpm/woztell/normalize.ts` or function-local equivalent
- Create: `src/lib/wpm/woztell/types.ts`

**Endpoint behavior:**

1. Accept `POST` JSON.
2. Save raw payload to `webhook_events` with status `received`.
3. Normalize key fields:
   - channel
   - external conversation ID
   - external user ID
   - message text
   - timestamp
   - attachments
   - page/account/channel identifier
4. Return a harmless test JSON response.

**Verification:**

Use a sample JSON fixture:

```bash
curl -X POST "$WOZTELL_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d @fixtures/woztell/sample-message.json
```

Expected:

- HTTP 200.
- `webhook_events` row created.
- No AI call yet.

### Task 2.3: Add payload fixtures

**Objective:** Make development repeatable without needing live Woztell each time.

**Files:**
- Create: `fixtures/woztell/sample-instagram-dm.json`
- Create: `fixtures/woztell/sample-whatsapp-message.json`
- Create: `fixtures/woztell/sample-facebook-message.json`

**Verification:**

- Fixture payloads can be passed to the webhook endpoint.
- Normalizer extracts a consistent shape from every fixture.

---

## Phase 3 — OpenAI Responses API Migration

### Task 3.1: Create server-side OpenAI Responses wrapper

**Objective:** Replace Assistants API runtime with Responses API runtime.

**Files:**
- Create: `supabase/functions/_shared/openai-responses.ts`
- Do not modify frontend OpenAI code yet.

**Wrapper behavior:**

Input:

```ts
{
  clientId: string;
  conversationId: string;
  userMessage: string;
  botProfile: BotProfile;
  instructions: BotInstructions;
  recentMessages: Message[];
  knowledgeContext?: string;
}
```

Output:

```ts
{
  text: string;
  toolCalls?: ToolCall[];
  rawResponse: unknown;
  model: string;
  usage?: unknown;
}
```

**Required properties:**

- Uses server-side `OPENAI_API_KEY`.
- Does not reference Assistant IDs.
- Does not use `openai.beta.threads.*`.
- Assembles system instructions from bot profile + client settings + template.

**Verification:**

- Local/unit test with mocked OpenAI call.
- No browser bundle contains OpenAI secret.

### Task 3.2: Add conversation history assembly

**Objective:** Feed recent conversation context into Responses API without relying on OpenAI Threads.

**Files:**
- Create: `supabase/functions/_shared/conversation-context.ts`

**Behavior:**

1. Load last N messages from Supabase by `conversation_id`.
2. Convert into Responses API-compatible input items.
3. Enforce max message count or token budget.

**Verification:**

- Given 10 stored messages, returns ordered conversation context.
- Does not include unrelated client conversations.

### Task 3.3: Add tool call abstraction

**Objective:** Execute lead/webhook/handoff actions server-side.

**Files:**
- Create: `supabase/functions/_shared/tools.ts`

**Initial tools:**

- `capture_lead`
- `send_webhook`
- `request_human_handoff`

**Behavior:**

- Validate tool args.
- Insert/update `leads` where applicable.
- Insert `tool_executions` for every attempt.
- Execute webhook only from server-side integration config.
- Return result object back to model/request handler.

**Verification:**

- Tool execution creates `tool_executions` rows.
- `capture_lead` creates/updates a `leads` row.
- Invalid args return structured errors.

---

## Phase 4 — Client/Channel Routing

### Task 4.1: Add client lookup by Woztell channel

**Objective:** Identify which client/bot should answer an inbound message.

**Files:**
- Create: `supabase/functions/_shared/client-routing.ts`

**Lookup fields:**

- channel type: Instagram / Facebook / WhatsApp
- Woztell channel ID / page ID / bot ID / phone number
- active flag

**Behavior:**

1. Extract channel identifiers from normalized payload.
2. Query `client_channels`.
3. Load `clients`, `bot_profiles`, and `bot_instructions`.
4. Fail gracefully if no match exists.

**Verification:**

- Known fixture maps to seeded test client.
- Unknown fixture logs error and returns safe fallback.

### Task 4.2: Add conversation upsert

**Objective:** Maintain one conversation per external user/channel/client.

**Files:**
- Create: `supabase/functions/_shared/conversations.ts`

**Behavior:**

- Upsert conversation by:
  - `client_id`
  - `channel`
  - `external_conversation_id` or `external_user_id`
- Store status: `active`, `handoff`, `closed`.
- Insert inbound message.
- Insert outbound message after AI response.

**Verification:**

- Repeated fixture calls reuse same conversation row.
- Messages append in order.

---

## Phase 5 — End-to-End Woztell Prototype

### Task 5.1: Connect webhook → routing → Responses API → response formatter

**Objective:** Complete first real WPM Bridge loop.

**Files:**
- Modify: `supabase/functions/woztell-webhook/index.ts`
- Create: `supabase/functions/_shared/woztell-response.ts`

**Flow:**

1. Receive Woztell payload.
2. Save raw webhook event.
3. Normalize payload.
4. Route to client/bot.
5. Upsert conversation.
6. Insert inbound message.
7. Load recent messages + instructions.
8. Call Responses API.
9. Execute tools if needed.
10. Insert outbound message.
11. Update webhook event status to `processed`.
12. Return Woztell-compatible JSON.

**Verification:**

- Sample fixture returns valid response JSON.
- Supabase logs raw event, normalized event, inbound message, outbound message.
- No OpenAI call happens in browser.

### Task 5.2: Add error handling and fallback response

**Objective:** Prevent silent failures in production.

**Behavior:**

- If client lookup fails: log `unmatched_channel`, return fallback.
- If OpenAI fails: log `ai_error`, return fallback.
- If tool fails: log tool failure, continue if possible.

**Fallback message:**

```text
Thanks for reaching out. A team member will follow up shortly.
```

**Verification:**

- Bad fixture returns HTTP 200 with fallback where Woztell requires it.
- Error details are stored in `webhook_events` / `tool_executions`.

---

## Phase 6 — Dashboard Conversion

### Task 6.1: Replace Assistant ID UI language

**Objective:** Stop presenting product setup as OpenAI Assistant ID based.

**Files:**
- Modify: `src/pages/Settings.tsx`
- Modify: `src/components/BotManagement.tsx`
- Modify: `src/lib/supabase/bots.ts`

**Replace labels:**

- `OpenAI Assistant ID` → `Bot Instructions / Template`
- `API Key Override` → remove from client-facing UI or restrict to admin-only
- `AI Bots` → `AI DM Agents` or `Client Agents`

**Verification:**

- UI no longer asks clients to paste Assistant IDs for new agents.
- Build succeeds.

### Task 6.2: Add Clients page

**Objective:** Setup person can create/manage client profiles.

**Files:**
- Create: `src/pages/Clients.tsx`
- Create: `src/lib/supabase/clients.ts`
- Modify: `src/App.tsx`
- Modify: sidebar/navigation component

**Fields:**

- Business name
- Industry
- Website
- Contact email
- Phone
- Timezone
- Status

**Verification:**

- Authenticated WPM user can create/read/update client records.
- No public access.

### Task 6.3: Add Client Agent setup page

**Objective:** Setup person can configure one bot profile for a client.

**Files:**
- Create: `src/pages/ClientAgent.tsx`
- Create: `src/lib/supabase/botProfiles.ts`

**Fields:**

- Agent name
- Public intro
- Tone
- Language
- Industry template
- Business hours
- Booking link
- Handoff contact
- Emergency keywords
- Do-not-say rules
- Lead fields to collect

**Verification:**

- Saved config is visible in Supabase.
- Config is loadable by WPM Bridge endpoint.

### Task 6.4: Add test conversation panel

**Objective:** Test the AI agent before connecting Woztell.

**Files:**
- Create: `src/pages/TestAgent.tsx`
- Create: `src/lib/wpm/testAgent.ts`

**Behavior:**

- Select client.
- Type test message.
- Call backend `test/simulate-message` endpoint.
- Display normalized input, model reply, tool calls, and logs.

**Verification:**

- Test panel creates conversation/messages like real inbound channel.
- Shows errors clearly.

---

## Phase 7 — Templates + Productization

### Task 7.1: Add industry templates

**Objective:** Make setup repeatable and client self-setup friendly.

**Files:**
- Create: `src/lib/wpm/templates/restaurant.ts`
- Create: `src/lib/wpm/templates/beauty-spa.ts`
- Create: `src/lib/wpm/templates/medical-dental.ts`
- Create: `src/lib/wpm/templates/home-services.ts`
- Create: `src/lib/wpm/templates/professional-services.ts`

**Each template includes:**

- Default instructions.
- Lead qualification questions.
- Common FAQs.
- Escalation triggers.
- Do-not-say rules.
- Recommended integrations.

**Verification:**

- Creating a bot profile from a template fills the setup form.

### Task 7.2: Add setup checklist

**Objective:** Convert the app into an SOP-driven platform.

**Files:**
- Create: `src/pages/SetupChecklist.tsx`
- Create: `docs/sop/client-launch-checklist.md`

**Checklist sections:**

1. Client onboarding form complete.
2. Meta/Woztell access confirmed.
3. Knowledge base loaded.
4. Agent rules approved.
5. Zapier/webhook tested.
6. Test conversation approved.
7. Woztell connection live.
8. Human handoff verified.
9. Launch complete.
10. Monthly optimization scheduled.

**Verification:**

- Setup person can see what remains before launch.

---

## Phase 8 — Verification and Deployment

### Task 8.1: Local build/lint

**Commands:**

```bash
npm install
npm run lint
npm run build
```

**Expected:**

- Lint passes or only existing issues are documented.
- Build passes.

### Task 8.2: Edge function test

**Commands:**

```bash
supabase functions serve woztell-webhook --env-file .env.local
curl -X POST "http://127.0.0.1:54321/functions/v1/woztell-webhook" \
  -H "Content-Type: application/json" \
  -d @fixtures/woztell/sample-instagram-dm.json
```

**Expected:**

- HTTP 200.
- Event rows created.
- Response JSON valid.

### Task 8.3: Deploy to Supabase project `upthfjkxbsqtipzoeecd`

**Commands:**

```bash
supabase link --project-ref upthfjkxbsqtipzoeecd
supabase db push
supabase functions deploy woztell-webhook
```

**Important:** Only run after Wilfre approves deployment to production Supabase.

### Task 8.4: PR and review

**Commands:**

```bash
git status
git add .
git commit -m "feat: add WPM Bridge foundation"
git push -u origin feature/wpm-bridge-responses-api
gh pr create --title "Add WPM Bridge foundation" --body "Adds productized WPM AI DM Agent backend/data model foundation."
```

**Verification:**

- PR exists.
- No secrets committed.
- Build passes.

---

## Secrets / Environment Variables Needed

Server-side only:

- `OPENAI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WOZTELL_WEBHOOK_SECRET` or verification token, if Woztell supports it
- Optional per-integration secrets

Frontend-safe:

- `VITE_SUPABASE_URL=https://upthfjkxbsqtipzoeecd.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<anon key>`

Remove from frontend/runtime where possible:

- `VITE_OPENAI_API_KEY`
- `VITE_OPENAI_ASSISTANT_ID`
- `VITE_ZAPIER_*_WEBHOOK`

---

## First MVP Acceptance Criteria

The first MVP is done when:

1. The app uses Supabase project `upthfjkxbsqtipzoeecd`.
2. There is a server-side Woztell webhook endpoint.
3. A sample Woztell payload creates a logged webhook event.
4. The payload maps to a client/channel.
5. The system calls OpenAI Responses API server-side.
6. The system saves inbound/outbound messages.
7. Lead capture can create a lead row.
8. Zapier/webhook calls happen server-side only.
9. A client can configure their own client profile and bot profile from the dashboard without WPM support.
10. No OpenAI secret or Zapier webhook URL is exposed in the frontend bundle.

---

## Recommended First Execution Slice

Start with the smallest useful slice:

1. Branch setup.
2. WPM Bridge schema migration.
3. Woztell webhook skeleton.
4. Sample Woztell fixture.
5. Payload normalizer.
6. Webhook event logging.
7. Test endpoint with fixture.

Only after that works, add OpenAI Responses API.

This avoids mixing database, Woztell, AI, and Zapier bugs in the same first pass.
