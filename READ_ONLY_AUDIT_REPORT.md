# WolfPack AI DM Agent — Read-Only Audit Report

Date: 2026-06-05
Repo: `wolfpackmediapr/saas-chatbot-wpm`
Live app: `https://saas-chatbot-platfor-e2qv.bolt.host/`
Audit mode: read-only. No app code, database rows, secrets, commits, or remote settings were changed.

## Executive Summary

The current Bolt/GitHub app is a useful prototype foundation, but it is not yet the productized WolfPack AI DM Agent described in the plan/audio context.

It is currently a browser-based React/Vite chat UI that:

- Uses Supabase Auth for login/signup.
- Stores per-user bot settings and chat history in Supabase tables expected by repo migrations.
- Calls OpenAI directly from the browser using `dangerouslyAllowBrowser: true`.
- Uses the deprecated OpenAI Assistants API / Threads API.
- Requires OpenAI Assistant IDs.
- Has hard-coded lead capture logic around HoneyBook/Zapier.
- Has no Woztell webhook receiver, no server-side bridge layer, no normalized channel payload handling, no client profile routing, no Responses API implementation, and no RAG/vector-store implementation in the app code.

Main architectural gap: the app is client-side first. The planned WPM product needs a server/edge bridge that owns secrets, channel routing, client configuration, AI calls, tool execution, logs, and Woztell response formatting.

## Verified Repo / App Facts

- Repo branch: `main`, clean after audit cleanup.
- Latest visible commits include:
  - `018c87e Fix chat message persistence`
  - `0d8cc4b Updated ChatInput.tsx`
  - `43822e4 Updated openai.ts`
- Package name: `wolfpack-media-assistant`
- Stack:
  - Vite
  - React 18
  - TypeScript
  - Tailwind
  - Supabase JS
  - OpenAI JS SDK
  - React Router
  - Framer Motion
  - Lucide icons
- Scripts:
  - `dev`: `vite`
  - `build`: `vite build`
  - `lint`: `eslint .`
  - `preview`: `vite preview`
- Size:
  - 89 tracked/non-git files inspected
  - `src`: 57 files, 5,638 lines
  - `supabase/migrations`: 8 migration files, 607 lines

## Current Routes

From `src/App.tsx`:

- Public:
  - `/signup`
  - `/login`
  - `/forgot-password`
- Protected behind Supabase auth:
  - `/`
  - `/chat/new`
  - `/chat/:threadId`
  - `/history`
  - `/settings`
  - `/subscription`
  - `/help`
  - `/feedback`

## Live UI Audit

Live app loads successfully.

Login page verified:

- Title: `WolfPack Media AI Assistant`
- Brand text: `WolfPack Media AI`
- Heading: `Welcome back`
- Fields: Email Address, Password
- Actions: Forgot password, Sign In, Sign up
- Footer: `© 2026 All Rights Reserved. Built by WolfPack Media LLC`
- Browser console on login/signup public pages: no JS errors observed.

Signup page verified:

- Heading: `Create your account`
- Fields: Full Name, Email Address, Password
- Actions: Create Account, Sign in, Terms of Service, Privacy Policy

No authenticated UI was tested because that would require credentials and could create/modify data.

## Major Finding: Supabase Project Mismatch

There are two Supabase projects in play.

### 1. Environment/project previously identified as WPM AI Agent

- Project name: `WPM AI Agent`
- Project ref: `bujaynemskuzziclsasq`
- Region: West US / North California
- REST schema exposed 29 paths, including WPM/Mission Control style tables:
  - `agents`
  - `agent_events`
  - `clients`
  - `client_onboarding`
  - `company_info`
  - `contact_details`
  - `faqs`
  - `services`
  - `social_posts`
  - `user_clients`
  - many `mission_control_*` tables
- The app-expected tables were not exposed/found there via REST:
  - `profiles`: not found
  - `user_settings`: not found
  - `ai_bots`: not found
  - `chat_threads`: not found
  - `chat_messages`: not found

### 2. Live Bolt app compiled Supabase project

The deployed bundle points to a different Supabase project:

- Project ref: `upthfjkxbsqtipzoeecd`
- Supabase project name listed by CLI: `sb1-gbfmr9wd`
- Region: East US / North Virginia

This means the live Bolt app is probably not using the `WPM AI Agent` Supabase project currently configured in the local Hermes environment.

This mismatch must be resolved before implementation, or we risk building against the wrong database.

## Current Database Design Expected by Repo

Migrations expect these product-prototype tables:

- `profiles`
  - user profile tied to `auth.users`
- `user_logs`
  - activity logging
- `user_settings`
  - company logo, response style, response length, OpenAI API key, OpenAI Assistant ID
- `chat_threads`
  - per-user chat history thread records, stores `openai_thread_id`, `bot_id`, `bot_name`
- `chat_messages`
  - per-thread messages, user/assistant flag, image array
- `ai_bots`
  - per-user bot configs: name, description, assistant ID, API key override, active bot, color, icon

These are adequate for a prototype web chat, but incomplete for the productized Woztell/WPM Bridge model.

## Current AI Architecture

Current code paths:

- `src/pages/Chat.tsx`
  - Loads active bot from Supabase.
  - Creates OpenAI thread using `startConversation`.
  - Sends messages via `sendMessage`.
  - Stores chat messages in Supabase.
- `src/lib/openai.ts`
  - Creates OpenAI client in browser.
  - Uses `openai.beta.threads.create()`.
  - Uses `openai.beta.threads.messages.create()`.
  - Uses `openai.beta.threads.runs.create()` with `assistant_id`.
  - Polls runs every second until complete.
  - Handles `requires_action` tool calls.
  - Sends tool call data to Zapier webhook.
  - Supports Whisper transcription through OpenAI audio API.
- `src/lib/openai/conversation.ts`
  - Similar deprecated Assistants/Threads flow.
- `src/lib/openai/client.ts`
  - Has `dangerouslyAllowBrowser: true`.
  - Requires `VITE_OPENAI_API_KEY` and `VITE_OPENAI_ASSISTANT_ID`.

Deprecated/OpenAI Assistant dependencies found in:

- `src/components/BotManagement.tsx`
- `src/lib/openai.ts`
- `src/lib/config/env.ts`
- `src/lib/supabase/settings.ts`
- `src/lib/supabase/bots.ts`
- `src/lib/openai/client.ts`
- `src/lib/openai/conversation.ts`
- `src/pages/Settings.tsx`
- `src/pages/Chat.tsx`

## Security Findings

### Critical: OpenAI keys are used in the browser

The app creates OpenAI clients client-side using `dangerouslyAllowBrowser: true`.

Risk:

- Any OpenAI key used by the app can be exposed to users/browser tooling.
- Not safe for productized client deployments.
- Not safe for WPM-owned multi-client infrastructure.

Required fix:

- Move all AI provider calls to Supabase Edge Functions, serverless API routes, or a WPM backend.
- Browser should call WPM Bridge endpoints, never OpenAI directly.

### Critical: Client-side Zapier webhook URLs

The live bundle includes Zapier webhook configuration in the frontend bundle.

Risk:

- Webhook URLs are effectively public.
- Anyone with bundle access can spam workflows.

Required fix:

- Store webhook URLs server-side in encrypted/integration config tables.
- Execute tool calls server-side only.

### High: Assistant IDs are first-class config

Assistant IDs appear in settings, bot config, database schema, and UI.

Risk:

- Locks the product to deprecated OpenAI Assistants API.
- Blocks the Responses API architecture described in the plan.

Required fix:

- Replace Assistant ID fields with bot profile/instructions/template/vector store/tool config fields.

## Productization Gap Analysis

The current app has:

- Auth/login UI
- Chat UI
- Basic bot management
- Chat history
- User settings
- Basic logo upload/storage helper
- Zapier/HoneyBook tool-call prototype
- Voice input/transcription hooks

The planned WPM AI DM Agent needs but does not yet have:

- Woztell webhook receiver
- Channel payload normalizer for IG/FB/WhatsApp
- Client lookup/routing by channel/account/page/phone number
- Client profile configuration model
- Bot instruction/template model independent of Assistant IDs
- OpenAI Responses API wrapper
- Server-side tool execution
- Knowledge base upload/import/search
- Vector store / RAG strategy
- Lead capture table and workflow
- Human handoff rules and alerts
- Conversation state/status per channel user
- Error/event logs for production support
- Setup-person admin dashboard
- Test conversation panel that simulates Woztell payloads
- Launch checklist / monthly optimization workflow
- Reporting/MRR support layer

## Recommended Target Architecture

Move from:

`Browser React app → OpenAI Assistants API → Zapier webhook`

To:

`Woztell / Web Chat / Test Panel → WPM Bridge API → Supabase config + logs → OpenAI Responses API → server-side tools/webhooks/RAG → normalized response → Woztell/user`

Core principle:

The browser dashboard configures the system. The WPM Bridge executes the system.

## Recommended Supabase Schema Additions

Keep existing auth/chat tables only if useful for the dashboard. Add product tables:

- `clients`
  - business/client entity
  - name, website, industry, timezone, status, owner user
- `client_channels`
  - client_id, channel type, Woztell bot/channel/page identifiers, verification token, active flag
- `bot_profiles`
  - client_id, public/internal bot name, template, tone, rules, language, escalation rules, model config
- `bot_instructions`
  - system/developer instructions, industry template version, never-say rules, lead qualification instructions
- `knowledge_sources`
  - source type, file/url/manual FAQ, status, metadata
- `knowledge_chunks`
  - chunk text, source_id, embedding/vector-store reference, metadata
- `conversations`
  - client_id, channel, external conversation/user IDs, status, assigned/handoff state
- `messages`
  - conversation_id, direction, normalized content, raw payload reference, model response metadata
- `leads`
  - client_id, conversation_id, name, email, phone, service interest, intent, status, qualification fields
- `integrations`
  - client_id, provider, webhook URL encrypted/server-only, field map, enabled flag
- `tool_executions`
  - tool name, payload, result, status, latency, error
- `webhook_events`
  - raw inbound Woztell payload, normalized payload, processing status, error details
- `handoff_events`
  - escalation reason, recipient, status

## Recommended Implementation Phases

### Phase 0 — Decide the source of truth

Before writing code:

1. Decide whether the production platform should use:
   - existing live project `upthfjkxbsqtipzoeecd`, or
   - intended project `bujaynemskuzziclsasq` / `WPM AI Agent`, or
   - a new clean Supabase project for `WolfPack AI DM Agent`.
2. Align Bolt environment variables with the chosen project.
3. Document environment variables and ownership.
4. Rotate exposed webhook URLs and any frontend-exposed AI keys if they have been used in production.

### Phase 1 — Stop using browser-side OpenAI

Build server/edge function endpoints:

- `POST /api/ai/respond`
- `POST /api/woztell/webhook`
- `POST /api/test/simulate-message`

Move these server-side:

- OpenAI API key
- OpenAI Responses API call
- Zapier/webhook execution
- Tool execution
- Conversation logging

### Phase 2 — Replace Assistants API with Responses API

Replace:

- `openai.beta.threads.*`
- `assistant_id`
- `purpose: assistants`

With:

- `openai.responses.create(...)`
- server-side instructions assembled from client/bot profile
- conversation history retrieved from Supabase
- tools/function calls executed server-side
- optional vector store/file search depending on final RAG choice

### Phase 3 — Build the WPM Bridge data model

Create migrations for:

- clients
- client_channels
- bot_profiles
- bot_instructions
- knowledge_sources/chunks or vector-store references
- conversations/messages
- leads
- integrations
- webhook_events/tool_executions

Add RLS/admin policies carefully.

### Phase 4 — Woztell prototype

Implement the first end-to-end flow:

1. Receive sample Woztell payload.
2. Verify token/signature if available.
3. Normalize payload.
4. Identify client/channel.
5. Load bot profile + knowledge + rules.
6. Call OpenAI Responses API.
7. Detect/execute lead capture tool if needed.
8. Log all events.
9. Return Woztell-compatible JSON.

### Phase 5 — Dashboard/admin setup UI

Adapt the current React app into setup/admin dashboard:

- Client list
- Client profile form
- Bot profile/instructions form
- Knowledge upload/import page
- Channel/Woztell config page
- Integration/Zapier config page
- Lead log
- Conversation log
- Error log
- Test conversation panel

### Phase 6 — Product templates and setup-person SOP

Add first five templates:

- Restaurant/Bar
- Beauty/Spa
- Medical/Dental
- Home Services
- Professional Services

Each template should include:

- Bot instructions
- FAQ starter set
- Lead qualification fields
- Human handoff keywords
- Do-not-say rules
- Zapier/CRM field mapping
- Testing checklist

## Immediate Next Technical Actions

1. Confirm Supabase production target.
2. Rotate exposed Zapier webhook URLs and any exposed AI keys.
3. Create a new implementation branch, e.g. `feature/wpm-bridge-responses-api`.
4. Add server-side endpoint layer using Supabase Edge Functions or a backend route strategy.
5. Create database migrations for WPM Bridge tables.
6. Implement a mock Woztell payload test fixture.
7. Implement `normalizeWoztellPayload()`.
8. Implement `createResponse()` wrapper around OpenAI Responses API.
9. Implement server-side `capture_lead` and `send_webhook` tools.
10. Add admin/test panel to simulate inbound Woztell messages.
11. Run build/lint and then test with sample payload.

## Bottom Line

This repo is a solid prototype shell for the dashboard, but the production product should not be built by extending the current browser-side Assistants API flow.

Use the existing app as the admin/setup dashboard foundation, then build a new WPM Bridge execution layer around Supabase + server-side Responses API + Woztell + server-side tools.

The highest-priority blocker is not UI. It is architecture: choose the correct Supabase project and move secrets/AI/tool execution out of the browser.
