# Agent conversation context — two defects, ready to execute

> **STATUS: PLANNED, NOT STARTED.** Written 2026-08-23 (late). Owner: Wilf.
>
> Found by auditing how the agent assembles conversation context. Both defects
> are live and both were verified against real production data, not inferred.
>
> **Deliberately deferred to fresh eyes** because both fixes land in
> `_shared/wpm_ai.ts`, which is bundled into **`meta-direct-webhook`** — the
> function answering live customers. Small changes, dangerous surface.

---

## The deploy hazard, first

```
wpm_ai.ts      → bundled ONLY into meta-direct-webhook   (the live reply path)
wpm_prompt.ts  → bundled into wpm-test-chat
```

Fixing either defect **requires redeploying `meta-direct-webhook`**, currently
**v76**. Do it once, with both fixes together, and verify with a real Instagram
DM immediately after. Do not batch anything else into that deploy.

```bash
npx supabase functions deploy meta-direct-webhook --project-ref upthfjkxbsqtipzoeecd --use-api
# then confirm — never infer a deploy from its response:
#   mcp list_edge_functions  → expect version 77
```

---

## Defect 1 — the agent cannot see human replies 🔴

### What happens

`supabase/functions/_shared/wpm_ai.ts:72`

```ts
function toChatRole(role: MessageRow['role']): 'user' | 'assistant' | null {
  if (role === 'user') return 'user';
  if (role === 'assistant') return 'assistant';
  return null;                       // ← 'human' lands here and is dropped
}
```

Inbox replies are stored `role='human'`, `direction='outbound'`. They are
**silently removed from the model's context**. Prod holds **30** of them.

### Live evidence — conversation `84e753f2-3fd2-4c98-9341-0f83eafd1f7d`

| # | role | content |
| --- | --- | --- |
| 9 | user | "I want meet but first **can I talk to a human**" |
| 8 | assistant | "Absolutely! I can connect you with a human team member…" |
| 7 | **human** | **a human replied — invisible to the AI** |
| 6 | user | "I'm going to leave you my email number and name **for you to call**" |
| 5 | assistant | **"I can't make calls"** |

The customer was replying to the human. The bot contradicted them.

> [!danger] This fires exactly when the bot resumes after a handoff
> `decideHandoffAction` deliberately returns the bot to a conversation once the
> human goes quiet — which is correct, and which is precisely the moment the bot
> most needs to know what the human just said. It is the one moment it is
> guaranteed to be blind.

### Second-order effect: the window silently shrinks

`.limit(12)` fetches twelve **rows**, and the `human` rows are filtered out
*after* that. So human involvement quietly reduces how much history the AI sees.
Measured live: three conversations currently give the AI **11, 4 and 2**
messages instead of 12.

### The fix

Map `human` to the `assistant` role — from the customer's point of view the
human and the bot are the same voice, so the conversation reads correctly — but
**label it**, so the model knows a colleague already spoke and does not
contradict or repeat them.

In `loadWpmBotContext`, replace the role mapping with something that preserves
the human turn, e.g.:

```ts
// A human replying from the Inbox is the same voice as the bot to the
// customer, so it must be an assistant turn or the transcript reads as if
// nobody answered. Label it so the model does not contradict or repeat a
// colleague — this is the exact moment the bot resumes after a handoff.
if (message.role === 'human') {
  return { role: 'assistant', content: `[Replied by a human teammate] ${message.content}` };
}
```

Then **raise the fetch limit** so the effective window stays at 12 real turns
after filtering — fetch ~20 rows and slice to the last 12 after mapping.
`buildWpmAssistantMessages` already does `.slice(-12)`, so the cap still holds.

### Verify

- Re-run the audit query: no conversation should show `ai_actually_sees < in_window`.
- Take over a test conversation from the Inbox, reply as a human, wait for the
  bot to resume, and confirm it acknowledges rather than contradicts.

---

## Defect 2 — the customer's last message is sent twice 🔴

### What happens

`meta-direct-webhook/index.ts:624` stores the inbound message **before**
generating a reply. Then `loadWpmBotContext` fetches the last 12 — now including
that very message — and `buildWpmAssistantMessages` appends it **again**:

```ts
return [
  { role: 'system', content: buildWpmSystemPrompt(context) },
  ...history,                                  // already ends with the inbound msg
  { role: 'user', content: inboundMessage },   // ← same text, a second time
];
```

### Why this is a bug and not a design choice

`wpm-test-chat/index.ts:216` compensates for exactly this, and says so:

```ts
.slice(0, -1) // drop the last user message — buildWpmAssistantMessages appends it
```

The Agent Test path understands the contract. The live path does not. Two
consequences: the newest message carries double weight in **every** reply, and
**Agent Test does not reproduce live behaviour** — which quietly undermines the
one tool for checking the agent before customers see it.

### The fix

In `loadWpmBotContext` (or at the call site in `generateAndStoreAssistantReply`),
drop the trailing stored copy of the inbound message before it is passed to
`buildWpmAssistantMessages`. Prefer matching on the stored row's
`provider_message_id` rather than on text equality — a customer who genuinely
sends the same words twice in a row must not have a real turn removed.

### Verify

- Log or assert the assembled `messages` array once: the final two entries must
  not be identical `user` turns.
- Send a live Instagram DM and confirm a normal, single-weighted reply.
- Send the same word twice in a row (`"hola"`, `"hola"`) and confirm **both**
  turns survive.

---

## Also found, lower priority

> [!warning] The 12-message window is hard-coded, with no summarization
> On Instagram and Messenger a DM thread is permanent — the same property that
> caused the all-time reply-cap incident. A returning customer's early history
> is simply gone, and nothing carries it forward. Combined with defect 1 the
> effective window is often well under 12. If this becomes a complaint, the fix
> is a rolling conversation summary rather than a bigger window.

> [!warning] Knowledge injection is unbounded
> `wpm_prompt.ts:222` injects up to 8 sources with `content_text` **in full** —
> there is no character cap or truncation anywhere in prompt assembly. Harmless
> today (629 chars total across the live client, on 128k-context models), but one
> customer pasting a long document into Knowledge Base could exceed the context
> window and leave people unanswered. Cap per source and in total before this is
> offered to customers who will paste PDFs into it.

## What is already correct — do not "fix" these

- **Ordering.** `order('created_at', desc).limit(12)` then `.reverse()` yields
  chronological order. Correct, and easy to break by "tidying".
- **Empty messages** are filtered out of history.
- **Deterministic escalation.** `matchEmergencyKeyword` runs regardless of what
  the model decided, so an emergency never depends on the LLM cooperating.
- **Attachment captions** now flow into `content`, so shared reels are in context.
