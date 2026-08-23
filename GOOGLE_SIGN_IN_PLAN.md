# Google sign-up and sign-in — plan

> **STATUS: PLANNED, NOT STARTED.** Written 2026-08-23. Owner: Wilf.
>
> Nothing here is urgent — email/password works and was proven end to end on
> 2026-08-21. This is a conversion feature: "Continue with Google" removes the
> password step from signup, which is the highest-friction moment in onboarding
> for a product people reach from an Instagram DM on their phone.

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

**Before enabling anything**, confirm in the Supabase dashboard how identity
linking is configured, and decide deliberately:

- **Automatic linking on verified email** — cleanest for users; Supabase links
  the Google identity to the existing account when the email matches and is
  verified. Note that **email confirmation is currently OFF** on this project
  (verified 2026-08-21 against `auth.users`), so existing addresses are *not*
  provably verified. That interaction must be checked, not assumed.
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

## Code changes

Small, and confined to the frontend.

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
- `npm run typecheck` at 0, `deno test supabase/functions/` green.
- Nothing in `supabase/functions/**` changes, so **no edge function is
  redeployed** — this ships through Vercel on merge.

## What NOT to do

- Do not request extra Google scopes "for later". Non-sensitive scopes avoid
  verification review; calendar or contacts access does not.
- Do not add Google sign-in to the Meta connect flow. That is a separate OAuth
  with its own approved scopes, and touching it re-opens Meta App Review.
- Do not implement account *merging* (folding two existing clients into one).
  Prevent the duplicate instead; merging is a data-migration feature and a much
  larger piece of work.
