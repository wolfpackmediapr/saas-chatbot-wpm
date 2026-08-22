# Model providers — fallback, choice, and eventually local

> **STATUS: PLANNED, NOT STARTED.** Written 2026-08-21. Owner: Wilf.
>
> Three goals, in the order they become worth doing:
> 1. **Redundancy** — an OpenAI outage should not silence every agent. *Near future.*
> 2. **Per-agent provider choice** — different clients, different models. *When asked for.*
> 3. **Local models** — chat ops on our own hardware. *Far future, and see the economics section before committing.*

---

## The good news: the seam already exists

`generateAndStoreAssistantReply()` does not talk to OpenAI. It takes a client:

```ts
export interface OpenAIChatClient {
  createChatCompletion(request: OpenAIChatRequest): Promise<OpenAIChatResponse>;
}
```

and `meta-direct-webhook` injects one:

```ts
const aiClient = createOpenAIChatClient(openaiKey);
const aiResult = await generateAndStoreAssistantReply({ openAI: aiClient, ... });
```

**Swapping providers therefore requires no changes to the reply pipeline at all** — only another implementation of that one method. The prompt building, knowledge loading, usage caps, handoff and lead extraction are all provider-agnostic already.

The database is ready too. `wpm_bot_profiles` carries `model_provider` and `model_name` per agent, and every outbound row records `model_provider`, `model_name` and `token_usage`. Someone built for this.

## The one decision that makes all three goals cheap

**Keep the OpenAI chat-completions wire format as the internal interface.**

Not out of loyalty to OpenAI — because vLLM, Ollama, LM Studio, Groq, Together and most local runtimes all speak it. If our client is "an OpenAI-compatible endpoint plus a base URL", then:

- local models become a **config change**, not a rewrite
- most hosted alternatives need **no adapter at all**
- Anthropic needs one thin adapter, because its API shape genuinely differs (system prompt is a top-level field, content blocks differ, `max_tokens` is required)

Everything below assumes this.

---

## Phase 0 — two small changes that unblock everything

Do these first. They are useful on their own and the rest depends on them.

### 0.1 Errors must carry the HTTP status

Today `createOpenAIChatClient` throws away the status:

```ts
if (!response.ok) {
  const message = raw?.error?.message ?? `OpenAI request failed with HTTP ${response.status}`;
  throw new Error(message);   // ← status survives only inside a string
}
```

A fallback layer cannot make a sane decision from a string. Throw a typed error carrying `status`, and whether the failure is retryable.

**This is the blocker for doing failover correctly**, so it comes first.

### 0.2 `baseUrl` becomes a parameter

`createOpenAIChatClient` hardcodes `https://api.openai.com/v1/chat/completions`. Make the base URL an argument defaulting to that.

One line, no behaviour change, and it is the entire mechanism by which Phase 3 works later. Any OpenAI-compatible endpoint — self-hosted or otherwise — is then reachable without new code.

---

## Phase 1 — fallback provider

A `createFallbackChatClient(primary, secondary)` that implements the same interface and wraps two clients. The pipeline stays untouched.

**Pick a different company, not a different endpoint.** Anthropic behind OpenAI means an OpenAI incident does not take both down. Azure OpenAI protects against far less than it appears to — shared model infrastructure, correlated failures.

Four rules matter more than the vendor choice:

> [!] **1. Fail over on infrastructure failures only.**
> 5xx, timeouts, 429. **Never on a 4xx.** A 400 means our request is malformed —
> that is our bug, and retrying it against another provider hides it while
> doubling the spend. A 401 means a broken key, which failover papers over until
> the fallback's key expires too.

> [!] **2. Do not double-send the customer.**
> The pipeline persists the reply, then sends the DM through the Graph API. A
> retry that crosses that boundary can deliver two messages to one person —
> the only failure in this list a customer actually notices. Retry the
> *completion*, never the send.

> [!] **3. Do not double-count usage.**
> The 24-hour reply cap and the 1,000-message free grant both count rows in
> `wpm_messages`. A failed-then-retried generation must produce exactly one
> row, or a customer's allowance drains at twice the rate during an incident —
> precisely when they are least able to tell why.

> [!] **4. Record the provider that actually answered.**
> Today `modelProvider` is read from the bot profile and written to the message
> row. If a fallback fires, that column will claim OpenAI answered when
> Anthropic did. The client must **report** which provider served the request,
> and that value — not the configured one — must be persisted. Without this you
> cannot answer "did quality drop because we failed over?", which is the first
> question anyone asks after an incident.

Also worth having: a short-lived circuit breaker, so a sustained outage does not pay the primary's timeout on every single message before falling through.

## Phase 2 — per-agent provider choice

`wpm_bot_profiles.model_provider` already exists and is already read per request. Making it authoritative means resolving the client from the profile instead of constructing one in the webhook.

This is what lets you **pilot a new provider on one agent** rather than switching everyone at once. It is also the safest way to test Phase 3 in production.

Needs a UI decision: does the customer choose, or do we? Recommend **we choose** for now — model choice is not a decision a restaurant owner wants to make, and exposing it invites support questions about names like `gpt-4.1-mini`.

## Phase 3 — local models

With Phase 0.2 done, a local runtime is a base URL. vLLM or Ollama serve the OpenAI schema directly, so `createOpenAIChatClient(key, 'http://our-box:8000/v1')` is very nearly the whole integration.

### Be honest about the economics first

**At current volume, local is not a cost win.** A GPU capable of matching `gpt-4.1-mini` quality costs more sitting idle for a month than the API costs serving a few hundred DMs a day. DM replies are also latency-visible — the current pipeline answers in about three seconds end to end, and a cold or under-provisioned local model will be slower, not faster.

Local becomes genuinely compelling for two other reasons:

- **Data residency.** An enterprise or regulated client who will not let customer conversations leave their infrastructure. This is a *sales unlock*, not a saving — and it is the most likely first real trigger.
- **Margin at scale.** Real, but only once sustained volume clears the cost of a always-on GPU. Compute it against actual `token_usage` totals before committing; that column is already populated, so the answer is a query rather than a guess.

**Do not build this before one of those two is true.** Build the abstraction now — it costs almost nothing — and switch when the reason arrives.

### If it does arrive

- Keep a hosted provider as the fallback. A self-hosted box is a new single point of failure, and Phase 1 already gives you the machinery.
- Vision matters: the pipeline sends `image_url` parts and already retries text-only when a vision request fails. A local model without vision must degrade through that same path, not error.
- Prompt behaviour will differ. `wpm_prompt.ts` encodes rules like "the agent must admit it is an AI" — those need re-verifying per model, not assuming.

---

## Verification before calling any phase done

- A forced primary outage (bad base URL) produces a customer reply from the fallback, and exactly **one** row in `wpm_messages`.
- A deliberate 400 does **not** fail over, and surfaces as an error.
- `wpm_messages.model_provider` names the provider that actually answered.
- A conversation spanning a failover reads coherently — the fallback receives the same history.
- Usage counters advance by one per exchange during a failover, not two.
- `deno test supabase/functions/_shared/` green; the reply-cap and usage tests are the ones most likely to catch a double-count.

## What not to do

- Do not put provider selection in the webhook. It belongs behind the client interface, or every new function that generates a reply repeats the logic.
- Do not fail over on a content refusal. That is a prompt problem and a second provider will usually refuse too.
- Do not name the vendor in customer-facing copy. The landing hero said "OpenAI powered" and was changed to "AI powered" on 2026-08-21 for exactly this reason; the provider is disclosed in the Terms, which is where it belongs.
