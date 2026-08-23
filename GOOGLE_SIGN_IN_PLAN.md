# Google sign-up and sign-in — plan

> **STATUS: ✅ FULLY LIVE 2026-08-23.** Owner: Wilf.
>
> Code merged, provider enabled, consent screen **published to production**, and
> the duplicate-account probe **passed**. The button is live on
> ai.wolfpackmediapr.com — and it appeared **with no redeploy** the moment the
> provider was saved in Supabase, which is what the live-config gate was for.
>
> **Google Cloud:** project `wolfpackmedia-ai`, on the **`authuser=1`** profile.
> The other signed-in Google account (authuser=0) is blocked from Google Cloud
> outright by 2SV enforcement, so always append `?authuser=1` to console URLs.
> No logo uploaded — deliberately, since uploading one forces brand verification.
> Scopes verified live as `email profile`; both non-sensitive, no review needed.
>
> **Probe result:** signing in with Google on an address that already existed as
> an email/password user **linked** the identity to that user. Still 2 users,
> same id, one client. Supabase does not duplicate when the email is confirmed —
> and `mailer_autoconfirm` means every email here is.
>
> **One thing still open:** the consent screen reads *"Sign in to
> upthfjkxbsqtipzoeecd.supabase.co"* rather than the app name, because the app
> has not been through Google brand verification. See the callout below.
>
> Nothing here is urgent — email/password works and was proven end to end on
> 2026-08-21. This is a conversion feature: "Continue with Google" removes the
> password step from signup, which is the highest-friction moment in onboarding
> for a product people reach from an Instagram DM on their phone.

> [!danger] The consent screen shows the Supabase domain, not your brand
> Added 2026-08-23, seen live. Google displays the OAuth client's redirect
> domain — `upthfjkxbsqtipzoeecd.supabase.co` — instead of "WolfPack Media AI",
> because the app has not been through brand verification. For a product people
> reach from an Instagram DM, a random-looking string on the consent screen
> reads as a phishing attempt and will cost signups at the exact moment you were
> trying to remove friction.
>
> Two ways out. **Supabase Custom Domains** (~$10/mo Pro add-on) moves auth to
> `auth.wolfpackmediapr.com`, which also fixes the Gmail password-reset
> link-stripping problem — one purchase, two fixes, and it is already on the
> open list. Or **Google brand verification**, which requires uploading a logo
> and entering review. Custom Domains is the better buy.

## What shipped (commit `fd487f8`)

| File | What it does |
| --- | --- |
| `src/lib/supabase/auth.ts` | `signInWithGoogle()`, returning to `/auth/complete` |
| `src/lib/supabase/authProviders.ts` | reads `/auth/v1/settings` and reports whether Google is enabled; cached per tab |
| `src/components/auth/GoogleSignInButton.tsx` | the button, the Google mark, and the "or" rule — all gated together |
| `src/pages/AuthCallback.tsx` | error exit parameterised so `/auth/complete` can say "Back to sign in" |
| `src/App.tsx` | new `/auth/complete` route |
| `Login.tsx`, `Signup.tsx` | the button above the form |

> [!danger] A disabled provider does not fail gracefully — it shows raw JSON
> `signInWithOAuth` never asks the server anything. It builds a URL and
> **navigates the browser to it**, so no catch block in the app is still running
> when the answer arrives. Verified against prod: with the provider off,
> `/auth/v1/authorize?provider=google` returns a bare
> `{"code":400,...,"msg":"Unsupported provider: provider is not enabled"}` —
> not a redirect back to the app. A user who clicked would land on that JSON,
> on the sign-in page of a live product. This is why the button is gated on the
> settings endpoint rather than on a try/catch, and it is why the code could be
> merged and deployed before any of the console work below was done.

> [!warning] `/auth/callback` was already taken — by Meta
> `public/auth/callback.html` sets `redirectUri = appOrigin + '/auth/callback'`
> and that URI is registered with Meta for the channel-connection popup. Google
> uses **`/auth/complete`** instead. Both render `AuthCallback`, whose whole job
> is to wait for supabase-js to read the session out of the URL fragment before
> anything asks who is signed in; landing straight on `/dashboard` would race
> `ProtectedRoute` and bounce to `/login`.

---

## The good news: the hard part is already built

`getOwnedWpmClient()` in `src/lib/supabase/wpmClients.ts` **lazy-creates the
client on first call**, and it already reads OAuth metadata first:

```ts
const userName =
  user.user_metadata?.full_name ??   // what OAuth providers use
  user.user_metadata?.name ??        // what signUp() writes
  (userEmail ? userEmail.split('@')[0] : null) ??
  'Your Business';
```

It then calls `ensureDefaultBotSetup()`, so a brand-new user gets a client
**and** a default agent without touching Signup.tsx at all.

**This means a Google user needs no new provisioning path.** They sign in, land
on the dashboard, and the client is created from their Google display name —
which is better data than the email prefix an email/password signup falls back
to. The comment in that function was already written with OAuth in mind.

So the work is: enable the provider, add a button, and handle the account
collision case below.

## The one real risk: duplicate accounts

> [!danger] Same person, two identities, two clients, split data
> Someone signs up with `jose@gmail.com` and a password today. Tomorrow they
> click "Continue with Google" with the same address. If Supabase does not link
> those identities, you get **two `auth.users` rows, two `wpm_clients`, two
> agents** — and their channels, conversations and leads live under whichever
> one they happened to log in as.

This is not hypothetical: this project already cleaned up `inhousechef.pr@gmail.co`
vs `inhousechef.pr@gmail.com` on 2026-08-22, which is the same failure shape
from a typo rather than a provider.

**Measured on prod 2026-08-23**, which narrows this considerably: there are
exactly **2 users**, each with a single `email` identity, and **both are
`email_confirmed`** — because `mailer_autoconfirm` is on, every signup is marked
confirmed automatically. Supabase links a new OAuth identity to an existing user
when the email matches and is confirmed, so linking *should* happen rather than
duplication. That is still reasoning about Supabase's behaviour rather than an
observation of it, so the probe below stays mandatory.

> [!danger] Autoconfirm means "confirmed" without anyone proving ownership
> `mailer_autoconfirm: true` marks an address confirmed at signup with no email
> sent. Combined with automatic linking, that allows account pre-hijacking:
> someone registers `victim@gmail.com` with a password before the real owner
> ever visits, and when the owner later clicks "Continue with Google" they are
> linked *into the attacker's account* — which the attacker still has the
> password for. The exposure is small today (2 users, 0 external signups) but it
> grows the moment the signup link spreads. Turning email confirmations on
> closes it, at the cost of reintroducing the deliverability problem that
> Custom Domains would fix.

**Before enabling anything**, confirm in the Supabase dashboard how identity
linking is configured, and decide deliberately:

- **Automatic linking on verified email** — cleanest for users; Supabase links
  the Google identity to the existing account when the email matches and is
  verified. Email *confirmation* is off, but `mailer_autoconfirm` is on, so
  `email_confirmed_at` is in fact set on every existing user (re-measured
  2026-08-23 — this corrects the earlier note that addresses were "not provably
  verified"; they are marked verified, just never actually proven). Linking
  should therefore apply. Still check it rather than assuming.
- **Block and explain** — if an account already exists for that email, tell
  them to sign in with their password and link Google from Settings afterwards.

Whichever is chosen, add a probe **before** go-live: create a throwaway
email/password account, then attempt Google sign-in with the same address, and
look at `auth.users` and `wpm_clients` to see how many rows exist.

## Prerequisites (outside the codebase)

1. **Google Cloud project** → APIs & Services → OAuth consent screen.
   - User type **External**, publishing status **In production** (in *Testing*
     it is capped at 100 users and shows an "unverified app" warning).
   - Scopes: `email`, `profile`, `openid` only. These are **non-sensitive**, so
     Google's full verification review is normally not required — publishing is.
     Adding anything else later drags this into review.
   - App name, logo, and links to
     `https://wolfpackmediapr.com/privacy-policy` and `/terms-of-service`
     (already live and already submitted to Meta — do not change those URLs).
2. **OAuth client ID** (type: Web application). Authorized redirect URI is
   Supabase's callback, not ours:
   ```
   https://upthfjkxbsqtipzoeecd.supabase.co/auth/v1/callback
   ```
3. **Supabase** → Authentication → Providers → Google → enable, paste client ID
   and secret. Redirect allow-list already carries
   `https://ai.wolfpackmediapr.com/**`, and Site URL is already correct — both
   were fixed on 2026-08-21, so neither needs touching.

> [!warning] The callback lives on `supabase.co`, not your domain
> The same mismatch that made Gmail strip the password-reset link. It matters
> less here because Google shows its own consent screen, but the address bar
> will read `upthfjkxbsqtipzoeecd.supabase.co` mid-flow. **Supabase Custom
> Domains** (~$10/mo, already on the open list) would put it on
> `auth.wolfpackmediapr.com` and fixes both problems at once.

## Code changes — DONE, see "What shipped" above

Kept for the record. The one deviation from this plan is the redirect target:
`/auth/complete`, not `/dashboard`, for the reasons in the callout at the top.

1. **`src/lib/supabase/auth.ts`** — add alongside the existing six exports:
   ```ts
   export async function signInWithGoogle() {
     return supabase.auth.signInWithOAuth({
       provider: 'google',
       options: { redirectTo: `${window.location.origin}/dashboard` },
     });
   }
   ```
2. **`Login.tsx` and `Signup.tsx`** — a "Continue with Google" button above the
   email field, with a divider. Same component on both; the flow is identical,
   which is part of the appeal.
3. **Redirect landing.** `signInWithOAuth` returns to `redirectTo` with the
   session in the URL fragment; supabase-js picks it up automatically. Confirm
   `/dashboard` renders while that happens rather than bouncing to `/login` —
   the router already has an auth guard, and this is exactly the kind of race
   that made the password-reset route fail before.
   - Note `public/auth/callback.html` exists but is the **Meta OAuth** popup
     handler. Do not reuse it; Supabase's own callback does this work.
4. **Nothing in `Signup.tsx`'s session branch changes.** It already handles
   "session exists → go to dashboard", which is the OAuth outcome too.

## Verification before calling it done

- New Google user → lands on `/dashboard`, `wpm_clients` has exactly **one**
  row named from their Google display name, and a default agent exists.
- Existing email/password user signing in with Google → **one** `auth.users`
  row and **one** `wpm_clients` row, not two. This is the test that matters.
- Sign out and back in with Google → same client, no second one.
- Password reset for a Google-only account behaves sanely (they have no
  password; the flow should not strand them).
- `npm run typecheck` at 0, `deno test supabase/functions/` green. ✅ done
  2026-08-23 (typecheck 0, 139 tests, build clean, eslint unchanged at 149).
- Nothing in `supabase/functions/**` changes, so **no edge function is
  redeployed** — this ships through Vercel on merge. ✅ confirmed.
- Both auth pages render unchanged while the provider is off. ✅ verified in a
  browser against the real settings endpoint, and again with the gate stubbed
  open to confirm the button and divider appear together.

## What NOT to do

- Do not request extra Google scopes "for later". Non-sensitive scopes avoid
  verification review; calendar or contacts access does not.
- Do not add Google sign-in to the Meta connect flow. That is a separate OAuth
  with its own approved scopes, and touching it re-opens Meta App Review.
- Do not implement account *merging* (folding two existing clients into one).
  Prevent the duplicate instead; merging is a data-migration feature and a much
  larger piece of work.
