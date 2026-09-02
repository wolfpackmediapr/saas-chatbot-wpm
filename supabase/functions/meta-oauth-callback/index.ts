/**
 * meta-oauth-callback — Save selected Facebook/Instagram channels after OAuth.
 *
 * Request body:
 *   { long_lived_token: string, supabase_user_id: string, selected_page_ids: string[] }
 *
 * When selected_page_ids is provided, only those pages are saved.
 * When omitted, all pages are saved (backwards-compatible).
 */

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
    // Support both old (user_token) and new (long_lived_token) callers
    const token: string = body.long_lived_token || body.user_token;
    const selected_page_ids: string[] | null = body.selected_page_ids ?? null;

    if (!token) return jsonResponse({ error: "long_lived_token required" }, 400);

    const appId = Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("META_APP_SECRET");

    if (!appId || !appSecret) {
      return jsonResponse({ error: "META_APP_ID or META_APP_SECRET not configured" }, 500);
    }

    // Derive the user from the JWT — never trust a user ID from the body,
    // or any authenticated user could overwrite another user's channels.
    const jwt = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!jwt) return jsonResponse({ error: "No authorization token" }, 401);

    const supabaseUrlForAuth = Deno.env.get("SUPABASE_URL");
    const serviceKeyForAuth = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrlForAuth || !serviceKeyForAuth) {
      return jsonResponse({ error: "Supabase not configured" }, 500);
    }
    const authClient = createClient(supabaseUrlForAuth, serviceKeyForAuth, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(jwt);
    if (authError || !user) return jsonResponse({ error: "Invalid token" }, 401);

    const supabase_user_id = user.id;
    if (body.supabase_user_id && body.supabase_user_id !== user.id) {
      return jsonResponse({ error: "supabase_user_id does not match the authenticated user" }, 403);
    }

    // If we received a short-lived token (old caller), exchange it first.
    // Long-lived tokens from meta-fetch-pages skip this step.
    let longLivedToken = token;
    if (!body.long_lived_token && body.user_token) {
      const resp = await fetch(
        `${GRAPH_API_BASE}/oauth/access_token` +
          `?grant_type=fb_exchange_token` +
          `&client_id=${appId}` +
          `&client_secret=${appSecret}` +
          `&fb_exchange_token=${encodeURIComponent(token)}`
      );
      const data = await resp.json();
      if (!resp.ok || data.error) {
        return jsonResponse({ error: "Failed to exchange token", details: data }, 400);
      }
      longLivedToken = data.access_token;
    }

    // Fetch pages
    const pagesResp = await fetch(
      `${GRAPH_API_BASE}/me/accounts` +
        `?fields=id,name,access_token,category,tasks,instagram_business_account{id,username}`,
      { headers: { Authorization: `Bearer ${longLivedToken}` } }
    );

    const pagesData = await pagesResp.json();

    if (!pagesResp.ok || pagesData.error) {
      return jsonResponse({ error: "Failed to fetch pages", details: pagesData }, 400);
    }

    let pages: MetaPage[] = pagesData.data || [];

    if (pages.length === 0) {
      console.error("[meta-oauth-callback] /me/accounts returned zero Pages at save time");
      return jsonResponse(
        {
          error: "Facebook didn't return any Pages for this account.",
          hint:
            "The Facebook profile you signed in with needs a role on the Page itself — access to the business portfolio is not enough. Try Connect via Meta again, and use \"Connect a different Meta account\" if the wrong profile is signed in.",
        },
        400,
      );
    }

    // Filter to only selected pages when the caller specifies
    if (selected_page_ids && selected_page_ids.length > 0) {
      pages = pages.filter((p) => selected_page_ids.includes(p.id));
    }

    if (pages.length === 0) {
      console.error("[meta-oauth-callback] Selected page ids matched none of the account's Pages");
      return jsonResponse(
        {
          error: "The Page you picked is no longer available on this Facebook account.",
          hint:
            "Your Facebook sign-in may have expired, or the Page was picked under a different profile. Please start Connect via Meta again.",
        },
        400,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: "Supabase not configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: clientRow, error: clientError } = await supabase
      .from("wpm_clients")
      .select("id")
      .eq("owner_user_id", supabase_user_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (clientError || !clientRow) {
      return jsonResponse(
        { error: "No client profile found for this user. Please complete onboarding first." },
        400
      );
    }

    const clientId: string = clientRow.id;
    const connectedChannels: { name: string; type: string; webhookSubscribed?: boolean }[] = [];

    for (const page of pages) {
      // Subscribe the page to this app's webhook — without this, Meta never
      // delivers DMs for the page. Covers the linked IG account too (IG DMs
      // arrive via the page subscription).
      let webhookSubscribed = false;
      try {
        const subResp = await fetch(
          `${GRAPH_API_BASE}/${page.id}/subscribed_apps` +
            `?subscribed_fields=messages,messaging_postbacks`,
          { method: "POST", headers: { Authorization: `Bearer ${page.access_token}` } }
        );
        const subData = await subResp.json();
        webhookSubscribed = subResp.ok && subData.success === true;
        if (!webhookSubscribed) {
          console.error(`[meta-oauth] subscribed_apps failed for page ${page.id}:`, subData);
        }
      } catch (subErr) {
        console.error(`[meta-oauth] subscribed_apps error for page ${page.id}:`, subErr);
      }

      const { error: fbError } = await supabase
        .from("wpm_client_channels")
        .upsert(
          {
            client_id: clientId,
            channel_type: "facebook",
            provider: "meta",
            provider_channel_id: page.id,
            external_page_id: page.id,
            display_name: page.name,
            page_access_token: page.access_token,
            is_active: true,
            metadata: { page_name: page.name, category: page.category, tasks: page.tasks, webhook_subscribed: webhookSubscribed },
          },
          { onConflict: "provider,provider_channel_id,channel_type", ignoreDuplicates: false }
        );

      if (!fbError) connectedChannels.push({ name: page.name, type: "facebook", webhookSubscribed });
      else console.error("[meta-oauth] Facebook upsert failed:", fbError);

      if (page.instagram_business_account?.id) {
        const ig = page.instagram_business_account;
        const { error: igError } = await supabase
          .from("wpm_client_channels")
          .upsert(
            {
              client_id: clientId,
              channel_type: "instagram",
              provider: "meta",
              provider_channel_id: ig.id,
              external_page_id: page.id,
              display_name: ig.username ? `@${ig.username}` : page.name,
              page_access_token: page.access_token,
              is_active: true,
              metadata: { ig_user_id: ig.id, ig_username: ig.username, facebook_page_id: page.id, webhook_subscribed: webhookSubscribed },
            },
            { onConflict: "provider,provider_channel_id,channel_type", ignoreDuplicates: false }
          );

        if (!igError) connectedChannels.push({ name: ig.username ? `@${ig.username}` : page.name, type: "instagram", webhookSubscribed });
        else console.error("[meta-oauth] Instagram upsert failed:", igError);
      }
    }

    // Pin newly connected channels to a concrete agent.
    //
    // The upserts above deliberately omit bot_profile_id so that re-running
    // OAuth (adding a second Meta account, or re-granting) never clobbers an
    // assignment made in Channel Connections. That leaves brand-new rows NULL,
    // which falls through to the router's "first active agent for the client"
    // path — fine with one agent, ambiguous with several. Resolving it here
    // makes routing explicit and visible in the UI instead of implicit.
    //
    // Scoped to bot_profile_id IS NULL, so it only ever fills a blank.
    const { data: defaultAgent } = await supabase
      .from("wpm_bot_profiles")
      .select("id")
      .eq("client_id", clientId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (defaultAgent?.id) {
      const { error: pinError } = await supabase
        .from("wpm_client_channels")
        .update({ bot_profile_id: defaultAgent.id })
        .eq("client_id", clientId)
        .is("bot_profile_id", null);
      if (pinError) console.error("[meta-oauth] Failed to pin default agent:", pinError);
    }

    return jsonResponse({
      success: true,
      pagesConnected: connectedChannels.length,
      channels: connectedChannels,
    });
  } catch (err) {
    console.error("[meta-oauth] Error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
