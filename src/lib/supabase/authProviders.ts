import { useEffect, useState } from 'react';

/**
 * Which external auth providers this Supabase project actually has enabled.
 *
 * This is not defensive padding. `signInWithOAuth` does not ask the server
 * anything — it builds a URL and navigates the browser to it. If the provider
 * is disabled, `/auth/v1/authorize` answers with a bare HTTP 400 JSON body:
 *
 *   {"code":400,"error_code":"validation_failed",
 *    "msg":"Unsupported provider: provider is not enabled"}
 *
 * The user is already off our page by then, so no catch block in the app can
 * turn that into a decent message — they just stare at raw JSON on a sign-in
 * screen. Asking first is the only thing that prevents it.
 *
 * The upside is that the button is driven by live configuration: enabling
 * Google in the Supabase dashboard makes it appear with no redeploy, and
 * turning it off again removes it.
 *
 * `/auth/v1/settings` is a public, unauthenticated-but-apikey'd endpoint that
 * returns exactly this. The result is cached for the tab, so Login and Signup
 * share one request.
 */
export interface AuthProviders {
  google: boolean;
}

let cached: Promise<AuthProviders> | null = null;

export function fetchEnabledAuthProviders(): Promise<AuthProviders> {
  if (cached) return cached;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    cached = Promise.resolve({ google: false });
    return cached;
  }

  cached = fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => ({ google: body?.external?.google === true }))
    // Never let a failed probe break the sign-in page. Email and password are
    // always there; the worst case is that a working Google button stays hidden.
    .catch(() => ({ google: false }));

  return cached;
}

/**
 * `undefined` while the answer is still unknown, so callers can render nothing
 * rather than flashing a button that may be about to disappear.
 */
export function useGoogleAuthEnabled(): boolean | undefined {
  const [enabled, setEnabled] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let active = true;
    fetchEnabledAuthProviders().then((p) => {
      if (active) setEnabled(p.google);
    });
    return () => {
      active = false;
    };
  }, []);

  return enabled;
}
