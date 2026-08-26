# Spanish / English UI — plan, not yet started

**Status:** planned 2026-08-25, agreed to start with the conversion surface only.
**Market:** Puerto Rico. Spanish is the working language of most target businesses.

---

## The thing to be clear about first

**The product already speaks Spanish.** `response_language` is per-agent and it
works — verified live on 2026-08-25: Publimedia answered a Spanish customer
correctly about media monitoring, and a Spanish voice note transcribed
accurately. What a *customer* experiences is already bilingual.

What is English-only is the **dashboard and the marketing pages**. So this is
not "make the product Spanish"; it is "stop the sign-up funnel being in the
wrong language."

## Measured scope (2026-08-25)

| | |
| --- | --- |
| `.tsx` files | 55 |
| Pages | 22 |
| Lines in `src/pages/` | 7,714 |
| Translatable strings | roughly **600–900** (JSX text, labels, placeholders, `aria-label`, error copy) |
| i18n library | **none installed** |
| Landing + Pricing + Signup + Login | **840 lines ≈ 11%** of page code |

Heaviest pages, for sequencing later: `Inbox` 794 · `AgentSetup` 754 ·
`ChannelConnections` 628 · `Settings` 603 · `BusinessProfile` 550.

---

## Phase 1 — the conversion surface ONLY (do this first)

**Landing, Pricing, Signup, Login.** About 11% of the work sitting on 100% of
the bounce risk.

The reasoning: a Puerto Rican business owner deciding whether to try this hits
the **landing page** first, and some fraction bounce before they ever see the
product. Someone who has already signed up and is configuring an agent is
committed — an English dashboard is friction, not a dealbreaker, and this
market is largely bilingual once engaged.

There are **zero real conversions** as of 2026-08-25, so the funnel is the
wound. Ship Phase 1, then look at whether Spanish traffic behaves differently
before paying for the other 89%.

### Setup

- **`react-i18next`**. Not fashion — plurals and interpolation are genuinely
  needed (`TrialBar` already hand-rolls `1 day` / `4 days`; Spanish needs
  `1 día` / `4 días`), and extraction tooling matters at 600+ strings.
- Namespaces per page so Phase 2 can land incrementally.
- Default from `navigator.language`, switch in the header, persisted in
  `localStorage`.
- **`es-PR` conventions, not Spain's.** "Celular" not "móvil"; usted/tú
  register decided once and applied consistently.

### Definition of done for Phase 1

- Every string on those four pages comes from a resource file
- Language switch visible before login (it is a pre-signup decision)
- Trial copy correct in both: *"1,000 mensajes o 7 días, lo que ocurra primero"*
- No hardcoded English left in the signup error paths — that is exactly where a
  confused user gives up

## Phase 2 — the dashboard

Only once Phase 1 shows Spanish traffic converting. Sequence by how early a new
user meets the page, not by size: Launch Checklist → Business Profile → Agent
Setup → Channel Connections → Knowledge Base → Inbox → Settings.

---

## Traps

> [!danger] The legal pages are Meta-submitted and must not move
> Privacy Policy, Terms of Service and Data Deletion Instructions are static
> HTML at URLs submitted to Meta during App Review. **Those URLs must never
> change.** Translating them also raises which language is legally
> authoritative — a lawyer question, not a sprint task. Leave them in English
> for Phase 1; if translated later, serve both from stable URLs and state which
> version governs.

> [!warning] Auth emails are a separate system
> Password reset and any future confirmation mail are **Supabase Auth
> templates**, not React. They will still be English after Phase 1. Doing them
> means either one bilingual template or per-locale templates — and the reset
> template was hand-tuned on 2026-08-21 to stop Gmail flagging it as spam, so
> **do not casually rewrite it**; re-test deliverability from a cold Gmail
> address after any change.

> [!warning] The agent's language is independent — do not couple them
> `response_language` is per-agent and set in Agent Setup. A business owner may
> well want an English dashboard and a Spanish agent, or the reverse. The UI
> locale must **never** be inferred from the agent's language, or from the
> agent's language changed by the UI switch.

> [!note] The real cost is ongoing, not upfront
> Every feature from then on ships twice. That is permanent and it is the part
> that gets underestimated — more than the initial translation pass.

---

## Open questions

1. **Machine-translate then review, or write Spanish first?** The copy is
   marketing prose with a specific voice; a literal translation of "Never miss
   another lead in Instagram or Facebook DMs again" will read badly. Budget for
   a rewrite, not a translation, on the hero and pricing copy.
2. **Does the language switch belong in the public nav** (pre-signup) as well as
   Settings? Phase 1 says yes — it is a pre-signup decision.
3. **Do we store a locale preference on the user** so it follows them across
   devices, or is `localStorage` enough? Start with `localStorage`; a column on
   `wpm_clients` or user metadata can come later.
4. **URL strategy** — `/es/...` paths, a subdomain, or client-side only?
   Client-side only is simplest but gives Spanish content no separate URL to
   rank in search, which matters if the landing page is a marketing asset.
