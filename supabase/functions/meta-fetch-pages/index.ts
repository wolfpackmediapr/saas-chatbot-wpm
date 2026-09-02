/**
 * meta-fetch-pages — Exchange a Facebook authorization code (or short-lived user token)
 * for a long-lived token, then return the list of managed Pages + Instagram accounts.
 *
 * Does NOT write to the database. Returns page data so the frontend can show a
 * selection UI before committing to the database via meta-oauth-callback.
 *
 * Accepted request bodies:
 *   { code: string, redirect_uri: string, supabase_user_id: string }   ← preferred (direct FB OAuth)
 *   { user_token: string, supabase_user_id: string }                   ← legacy fallback
 *
 * Response: { success: true, long_lived_token: string, pages: MetaPageResult[] }
 *
 * On failure: { error: string, hint?: string, details?: unknown }. `error` states
 * what happened, `hint` says what the person should do about it — and it must be
 * honest about WHOSE problem it is, because the caller shows both strings
 * verbatim to a business owner who cannot read a log. See readFunctionError() in
 * src/lib/supabase/functionError.ts for how they are recovered from a non-2xx.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { GRAPH_API_BASE } from "../_shared/wpm_meta_api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  category: string;
  tasks: string[];
  instagram_business_account?: { id: string; username: string };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await request.json();

    // Require a valid session: without this the endpoint is an open proxy
    // that exchanges any Facebook token using this app's secret.
    const jwt = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!jwt) return jsonResponse({ error: "No authorization token" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return jsonResponse({ error: "Supabase not configured" }, 500);
    const authClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(jwt);
    if (authError || !user) return jsonResponse({ error: "Invalid token" }, 401);

    const appId = Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("META_APP_SECRET");

    if (!appId || !appSecret) {
      return jsonResponse({ error: "META_APP_ID or META_APP_SECRET not configured" }, 500);
    }

    // ── Step 1: Obtain a short-lived user access token ────────────────────────
    // Path A: we received an authorization code from the direct Facebook OAuth dialog
    // Path B: we received a short-lived user token directly (legacy)
    let shortLivedToken: string;

    if (body.code && body.redirect_uri) {
      // Exchange authorization code → short-lived user token
      const codeExchangeUrl = new URL(`${GRAPH_API_BASE}/oauth/access_token`);
      codeExchangeUrl.searchParams.set("client_id", appId);
      codeExchangeUrl.searchParams.set("client_secret", appSecret);
      codeExchangeUrl.searchParams.set("redirect_uri", body.redirect_uri);
      codeExchangeUrl.searchParams.set("code", body.code);

      const codeResp = await fetch(codeExchangeUrl.toString());
      const codeData = await codeResp.json();

      if (!codeResp.ok || codeData.error) {
        console.error("[meta-fetch-pages] Code exchange failed:", codeData);
        return jsonResponse(
          {
            error: "Facebook wouldn't complete the sign-in.",
            hint: "The authorization from Facebook expired or was already used. Please try Connect via Meta again.",
            details: codeData?.error ?? codeData,
          },
          400,
        );
      }

      shortLivedToken = codeData.access_token;
    } else if (body.user_token) {
      shortLivedToken = body.user_token;
    } else {
      // Ours, not theirs: the Facebook sign-in returned without a token and the
      // caller invoked us anyway. Say so plainly rather than blaming their Meta
      // account, and log it — this branch used to return silently, which is why
      // a live incident could not be told apart from the empty-Pages one below.
      console.error(
        "[meta-fetch-pages] Called without credentials — no 'code' + 'redirect_uri' and no 'user_token'",
      );
      return jsonResponse(
        {
          error: "We couldn't read the result of your Facebook sign-in.",
          hint: "This is a problem on our side, not with your Meta account. Please try Connect via Meta again.",
        },
        400,
      );
    }

    // ── Step 2: Exchange short-lived token → 60-day long-lived token ─────────
    const longLivedUrl = new URL(`${GRAPH_API_BASE}/oauth/access_token`);
    longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
    longLivedUrl.searchParams.set("client_id", appId);
    longLivedUrl.searchParams.set("client_secret", appSecret);
    longLivedUrl.searchParams.set("fb_exchange_token", shortLivedToken);

    const longLivedResp = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedResp.json();

    if (!longLivedResp.ok || longLivedData.error) {
      console.error("[meta-fetch-pages] Long-lived exchange failed:", longLivedData);
      return jsonResponse(
        {
          error: "Facebook wouldn't extend your sign-in session.",
          hint: "Your Facebook login expired before we could finish. Please try Connect via Meta again.",
          details: longLivedData?.error ?? longLivedData,
        },
        400,
      );
    }

    const longLivedToken: string = longLivedData.access_token;

    // ── Step 3: Fetch pages the user manages ─────────────────────────────────
    const pagesUrl = new URL(`${GRAPH_API_BASE}/me/accounts`);
    pagesUrl.searchParams.set(
      "fields",
      "id,name,access_token,category,tasks,instagram_business_account{id,username}",
    );
    pagesUrl.searchParams.set("access_token", longLivedToken);

    const pagesResp = await fetch(pagesUrl.toString());
    const pagesData = await pagesResp.json();

    if (!pagesResp.ok || pagesData.error) {
      console.error("[meta-fetch-pages] Fetch pages failed:", pagesData);
      return jsonResponse(
        {
          error: "Facebook refused to list your Pages.",
          hint:
            "Meta rejected the request rather than returning an empty list, so this is usually a permission that wasn't granted. Try Connect via Meta again and accept every permission on Facebook's screen.",
          details: pagesData?.error ?? pagesData,
        },
        400,
      );
    }

    const pages: MetaPage[] = pagesData.data ?? [];

    if (pages.length === 0) {
      // Graph answered normally and returned an empty list. That is a fact about
      // the signed-in Facebook profile, not a fault in our pipeline — so name the
      // three things that actually cause it. Being an admin of the business
      // portfolio is NOT the same as holding a role on the Page itself, and that
      // distinction is the one that costs people the most time.
      console.error(
        "[meta-fetch-pages] /me/accounts returned zero Pages for the signed-in profile",
      );
      return jsonResponse(
        {
          error: "Facebook didn't return any Pages for the account you just signed in with.",
          hint:
            "That usually means one of three things: the Facebook profile you signed in with has no role on a Page (access to a business portfolio is not the same as a role on the Page itself); you didn't tick the Page on Facebook's permission screen; or your browser is signed in to a different Facebook profile — use \"Connect a different Meta account\" to switch. Instagram also has to be a Professional account linked to that Page.",
        },
        400,
      );
    }

    // Return long-lived token + page list
    // Token is held in frontend memory only, passed to meta-oauth-callback on save
    return jsonResponse({
      success: true,
      long_lived_token: longLivedToken,
      pages: pages.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        instagram: p.instagram_business_account
          ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username }
          : null,
      })),
    });
  } catch (err) {
    console.error("[meta-fetch-pages] Unexpected error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
