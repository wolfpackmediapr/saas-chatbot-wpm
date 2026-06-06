# Public Marketing Homepage + Pricing Tiers Plan
**Project:** WolfPack AI DM Agent (saas-chatbot-wpm)  
**Date:** Current session  
**Goal:** Add a professional public-facing marketing homepage (the "actual home" before login/dashboard) and realistic, profitable pricing tiers that account for real variable costs (OpenAI tokens + Woztell messaging fees).

---

## 1. Problem Statement (User Feedback)

The current app only has:
- Protected dashboard (post-login self-setup + Launch Checklist + Leads + Test Agent).
- Login / Signup pages.

There is **no public sales homepage**. Visitors hitting the domain see login or nothing useful for selling the product.

The attached screenshot shows the style the user likes for pricing: clean dark theme, 3 clear tiers (Basic / Professional "Most Popular" / Enterprise), monthly + yearly toggle (15% save), feature lists with checkmarks, strong CTAs.

We need:
- A high-converting public landing page that sells the **WolfPack AI DM Agent** (AI that answers DMs on WhatsApp/Instagram/Facebook via Woztell, qualifies leads, triggers automations, books calls, etc.).
- A dedicated `/pricing` page with sustainable tiers.
- Realistic pricing based on actual costs.

---

## 2. Product Positioning (for the Homepage)

**Core Offering:**
- Self-serve AI DM Agent for mid-market businesses (hospitality, healthcare/dental, professional services, ecommerce, etc.).
- Handles inbound DMs 24/7.
- Qualifies leads using your knowledge + custom instructions.
- Routes serious leads via automations (Zapier, email, webhooks, CRM).
- Full self-setup in minutes (Business Profile → Agent Setup → Knowledge → Channels → Automations → Test → Launch).
- Powered by Woztell (official messaging) + OpenAI.

**Key Value Props to highlight:**
- Never miss a lead in DMs again.
- Instant, on-brand replies that feel human.
- Automatic lead capture + routing.
- Full control via self-serve dashboard + Test Agent simulator.
- Results, not reports (WolfPack brand voice).

**Target Audience:**
- Businesses already active on WhatsApp/Instagram DMs.
- Want to scale without hiring more people for replies.
- Value premium positioning (matches WPM's "AI-native, not AI-bolted-on").

---

## 3. Public Homepage Structure (Marketing Landing)

**Route:** `/` (public for unauthenticated users)

**Authenticated users:** Automatically redirect to `/dashboard` (or keep current protected home as the app dashboard).

**Recommended Sections (conversion-optimized, dark/premium theme matching existing app):**

1. **Hero**
   - Bold headline: "AI That Answers Your DMs. Qualifies Leads. Books Calls."
   - Sub: "Deploy your own AI DM Agent in under 15 minutes. Powered by WolfPack."
   - Primary CTA: "Start 7-day free trial" → /signup
   - Secondary: "See it in action" → scroll to demo or /agent-test (public demo mode?)
   - Trust badges: "Official Woztell Partner", "Built for real businesses in Puerto Rico & beyond"

2. **Social Proof / Results**
   - "Trusted by agencies and service businesses"
   - Placeholder metrics or logos (we can seed with WPM case studies later)
   - Short quote cards

3. **How It Works** (simple 4-5 step visual)
   - Connect your WhatsApp/Instagram via Woztell
   - Quick self-setup (Business Profile + Knowledge + Instructions)
   - Train with Test Agent simulator (no risk)
   - Turn on automations (Zapier, email, CRM handoff)
   - Go live — AI handles inbound 24/7

4. **Key Features**
   - Intelligent replies from your exact knowledge + brand voice
   - Lead qualification + structured capture (name, email, intent, service interest)
   - One-click automations (webhooks, email via Resend, Zapier)
   - Full conversation history & lead database
   - Real-time Launch Checklist + usage monitoring
   - Test Agent simulator before going live
   - Bilingual support (English/Spanish PR dialect)

5. **Pricing Teaser**
   - 3 cards (Basic / Pro / Enterprise) with "Most Popular" badge on middle tier.
   - Link to full `/pricing` page.
   - "7-day free trial. No credit card required."

6. **FAQ** (common objections)
   - How does billing work with message volume?
   - What happens if I exceed my plan?
   - Can I cancel anytime?
   - How accurate is the AI?

7. **Final CTA**
   - "Ready to stop manually replying to DMs?"
   - Big "Get started free" button

**Tech Notes:**
- Keep everything in the existing Vite + React + Tailwind app (no separate marketing site for now — faster iteration).
- New page: `src/pages/Landing.tsx` (public, no Layout sidebar).
- Update `App.tsx` routing:
  - `/` → Landing (public)
  - Add logic: If user is authenticated, redirect from `/` to `/dashboard`
  - Move current dashboard to `/dashboard` (or keep protected routes under `/app`)
- New page: `src/pages/Pricing.tsx` (also public)
- Re-use existing design system (dark cards, cyan/blue accents, Montserrat/Josefin fonts).
- Add nice animations (framer-motion already used in old Home).
- Make it mobile-first and fast.

---

## 4. Pricing Tiers — Realistic & Profitable

### Cost Drivers (Critical)

**A. OpenAI (biggest variable cost)**
- Every inbound message triggers:
  - Full system prompt (your Business Profile + Agent Instructions + Knowledge Base + lead rules)
  - Recent conversation history (to maintain context)
  - Lead extraction logic
- Realistic average per message: **3,500 – 7,000 tokens** (input + output) on GPT-4o or GPT-4o-mini mix.
- Current pricing (approx):
  - GPT-4o: ~$2.50 / 1M input, $10 / 1M output
  - Average blended cost per message: **$0.015 – $0.04** (conservative)
- High-volume businesses (1,000+ messages/mo) can easily cost $15–$40+ in OpenAI alone.

**B. Woztell / Messaging Fees (second biggest)**
- Official WhatsApp Business API (via Woztell) uses conversation-based pricing.
- Per 24-hour conversation window (categorized: Utility, Marketing, Service, Authentication).
- Typical blended cost per started conversation: **$0.01 – $0.08** depending on country + category + volume.
- Plus per-message fees in some cases.
- Instagram/Facebook similar.
- Conservative average: **$0.02 – $0.06 per qualified conversation**.

**C. Other (fixed/low)**
- Supabase, Vercel, Resend, domain, monitoring: ~$50–150/mo per 50-100 active clients.

**Gross Margin Target:** 60–70% after variable AI + messaging costs.

### Recommended Pricing Tiers (Adjusted for Reality)

We will base this on the style in your screenshot but make numbers sustainable.

**Tier 1: Starter / Basic**
- Price: **$79/mo** (or $69/mo billed yearly)
- Limits:
  - 400 messages / month included
  - GPT-4o-mini (faster/cheaper model)
  - 30-day chat history
  - Basic automations (email + 1 webhook)
  - Standard support (email)
  - 20 image generations/mo (if we add vision/image features later)
- Overage: $0.08 per extra message (covers AI + messaging + margin)
- Best for: Small businesses testing the waters, low DM volume.

**Tier 2: Professional (Most Popular — recommend this as the hero tier)**
- Price: **$179/mo** (or $152/mo billed yearly — ~15% discount)
- Limits:
  - 2,000 messages / month included
  - Full GPT-4o (best quality)
  - Unlimited chat history + lead database
  - Full automations (Zapier, multiple webhooks, Resend email, CRM)
  - Priority support (same-day)
  - 100 image generations/mo
  - Advanced lead qualification + custom rules
  - Test Agent + full Launch Checklist
- Overage: $0.06 per extra message
- Best for: Most service businesses, agencies, clinics, restaurants with steady DM traffic.

**Tier 3: Enterprise / Agency**
- Price: **$449/mo** (or $382/mo billed yearly)
- Limits:
  - 6,000 messages / month included (or custom)
  - GPT-4o + option for fine-tuning / custom models later
  - Everything in Professional
  - API access (for custom frontends)
  - Dedicated support + onboarding call
  - Unlimited image generation
  - Custom integrations + white-label options (future)
  - Multi-location / multi-brand support
  - Priority Woztell channel provisioning
- Overage: $0.05 per extra message (volume discount)
- Best for: Larger businesses, marketing agencies managing multiple clients, high-volume operators.

**Billing Notes:**
- 7-day free trial (no credit card) on all plans.
- Yearly = 15% discount (as in your screenshot).
- Overage billing at end of month (transparent usage page in dashboard).
- Easy downgrade/upgrade.
- Pause or cancel anytime.

**Free / Low-Tier Entry (optional consideration):**
- We can add a very limited "Free" tier (50 messages/mo, basic model) to lower the barrier for leads, but only if we want top-of-funnel volume.

---

## 5. Cost Modeling Example (for Approval)

**Assumptions (conservative):**
- Professional plan customer sends 1,200 messages/month.
- 65% are simple (cheap model possible), 35% complex.
- Blended OpenAI cost: $0.022 per message.
- Blended Woztell cost: $0.028 per message.
- Total variable cost per message: **~$0.05**

**Per Professional customer:**
- Revenue: $179/mo
- Variable costs (1,200 msgs): ~$60
- Gross profit: $119
- Gross margin: **~66%** (healthy)

**At scale (100 Professional customers):**
- Revenue: $17,900/mo
- Variable costs: ~$6,000
- Contribution margin after variables: ~$11,900 (before fixed costs)

**Break-even considerations:**
- We need enough volume to cover OpenAI + Woztell before fixed costs.
- Pricing above is designed so even heavy users on Professional are profitable.
- Enterprise tier gives buffer for custom/high-volume work.

**Risk Mitigation:**
- Hard message caps + clear overage notifications in dashboard.
- Usage dashboard (messages this month, estimated cost).
- Option to switch to "pay-as-you-go" hybrid later.
- Monitor average token usage per client and adjust prompts/knowledge size.

---

## 6. Implementation Plan (Phased, TDD where possible)

**Phase 1 — Foundation (1-2 slices)**
- Create `src/pages/Landing.tsx` (beautiful marketing homepage using the style from your screenshot + existing dark theme).
- Create `src/pages/Pricing.tsx` (3-tier pricing exactly matching the visual in the image, with monthly/yearly toggle).
- Update routing in `App.tsx`:
  - `/` → Landing (public)
  - `/pricing` → Pricing (public)
  - Authenticated users hitting `/` → redirect to `/dashboard`
  - Move current dashboard content to `/dashboard` (update links in sidebar + Layout).
- Add public navbar (logo + "Pricing" + "Login" + "Get Started" buttons) for unauth users.
- Simple footer.

**Phase 2 — Polish & Conversion**
- Hero copy + value props tailored to WolfPack AI DM Agent.
- Add fake/demo "Book a demo" or "Watch 90-second video" (can be placeholder).
- Pricing page with "Start free trial" buttons that go to /signup with plan pre-selected (store in localStorage or URL param).
- Usage / overage messaging in dashboard (future slice).
- Analytics events for CTA clicks (if we add tracking).

**Phase 3 — Cost Controls & Dashboard**
- Add usage tracking (message counts per client per month) in Supabase.
- Show "Messages used this month" + estimated cost in dashboard.
- Overage handling logic in the bridge (soft cap + notification).

**Phase 4 — Content & Marketing**
- Real copy (use WPM brand voice: sharp, premium, direct, outcomes-first).
- Add case study placeholders or real WPM wins.
- SEO basics (title, meta, structured data).

**Testing:**
- All new public pages should be accessible without login.
- Protected routes still require auth.
- Build + deploy after each phase.

---

## 7. Open Questions for You (Approval Needed)

1. Do you want the public homepage + pricing in the **same repo/app** (current approach) or a completely separate marketing site (e.g. on wolfpackmediapr.com subdomain or different Vercel project)?
2. Target starting prices — are $79 / $179 / $449 acceptable, or do you want to adjust upward/downward?
3. Should we include a very limited free tier to capture more leads?
4. Any hard limits on image generation / voice (the screenshot had those — do we actually support them yet)?
5. Do you want a "Book a custom demo / enterprise sales call" flow on the Enterprise tier?
6. Yearly discount — keep at 15% or go to 20%?
7. Any specific features you want highlighted on the landing that aren't in the current dashboard (e.g. "Bilingual AI", "Woztell official", "Self-serve in 15 min")?

---

**Status:** Approved with 7-day trial. Implementation started.

**Next Steps**

1. Approve this plan (or give feedback/edits).
2. I will create the Landing page + Pricing page with the exact visual style from your screenshot.
3. Update routing and auth redirect logic.
4. Push to GitHub so you see it immediately in bolt.new.
5. We can iterate on copy, design tweaks, and cost tracking in follow-up slices.

This keeps everything aligned with the existing self-serve flow and the excellent dashboard work we've already done (Test Agent, Leads, Launch Checklist with real automation processor, etc.).

Ready when you are — reply with approval + any changes to the tiers or structure.
---

## Implementation Status (Current Session)

**APPROVED** — 7-day trial instead of 14-day.

**Delivered:**
- Modern, tech-looking public marketing landing page at `/` (hero, how it works, features, pricing teaser, FAQ, strong CTAs, 7-day trial messaging throughout).
- Full public `/pricing` page with monthly/yearly toggle, 15% savings, "Most Popular" highlight, detailed feature lists per tier, overage notes.
- Routing changes: Public root is now the marketing homepage. The app dashboard and all tools now live under `/dashboard`.
- Updated Login, Sidebar, and Home (dashboard) to use the new `/dashboard/*` paths.
- All CTAs point to `/signup` for the 7-day trial.
- Design matches the dark premium style from the screenshot you shared + modern tech aesthetic (gradients, motion hovers, clean cards, strong typography).

**To preview:**
- Unauthenticated visitors now see the selling homepage first.
- Logged-in users are redirected from `/` to `/dashboard`.
- `/pricing` is fully public and beautiful.

Next: We can iterate on copy, add more social proof, improve the pricing CTA flow (e.g. pre-select plan), or add usage tracking.

