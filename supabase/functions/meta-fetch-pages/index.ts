/**
 * meta-fetch-pages — Exchange a short-lived Facebook user token for pages list.
 *
 * Does NOT write to the database. Returns page + Instagram account data so the
 * frontend can display a selection UI before saving.
 *
 * Request body: { user_token: string, supabase_user_id: string }
 * Response: { success: true, long_lived_token: string, pages: MetaPageResult[] }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
    const { user_token, supabase_user_id } = await request.json();

    if (!user_token) return jsonResponse({ error: "user_token required" }, 400);
    if (!supabase_user_id) return jsonResponse({ error: "supabase_user_id required" }, 400);

    const appId = Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("META_APP_SECRET");

    if (!appId || !appSecret) {
      return jsonResponse({ error: "META_APP_ID or META_APP_SECRET not configured" }, 500);
    }

    // Exchange short-lived token for 60-day long-lived token
    const longLivedResp = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token` +
        `?grant_type=fb_exchange_token` +
        `&client_id=${appId}` +
        `&client_secret=${appSecret}` +
        `&fb_exchange_token=${encodeURIComponent(user_token)}`
    );

    const longLivedData = await longLivedResp.json();

    if (!longLivedResp.ok || longLivedData.error) {
      console.error("[meta-fetch-pages] Token exchange failed:", longLivedData);
      return jsonResponse({ error: "Failed to exchange for long-lived token", details: longLivedData }, 400);
    }

    const longLivedToken: string = longLivedData.access_token;

    // Fetch pages the user manages
    const pagesResp = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts` +
        `?fields=id,name,access_token,category,tasks,instagram_business_account{id,username}`,
      { headers: { Authorization: `Bearer ${longLivedToken}` } }
    );

    const pagesData = await pagesResp.json();

    if (!pagesResp.ok || pagesData.error) {
      console.error("[meta-fetch-pages] Fetch pages failed:", pagesData);
      return jsonResponse({ error: "Failed to fetch pages", details: pagesData }, 400);
    }

    const pages: MetaPage[] = pagesData.data || [];

    if (pages.length === 0) {
      return jsonResponse(
        { error: "No Facebook Pages found. Make sure you manage at least one Facebook Page." },
        400
      );
    }

    // Return page list + long-lived token for the save step
    // Token is held in frontend memory only, never persisted to localStorage
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
    console.error("[meta-fetch-pages] Error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
