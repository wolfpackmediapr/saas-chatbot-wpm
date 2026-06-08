/**
 * meta-oauth-callback — Handle Meta (Facebook/Instagram) OAuth callback
 *
 * After Supabase OAuth completes, this function:
 * 1. Gets the user's Facebook User Access Token from the session
 * 2. Exchanges for long-lived token (60 days)
 * 3. Fetches pages/IG accounts they manage
 * 4. Upserts into wpm_client_channels with provider='meta'
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const { user_token } = await request.json();

    if (!user_token) {
      return jsonResponse({ error: 'user_token required' }, 400);
    }

    // 1. Exchange for long-lived token (60 days)
    const appId = Deno.env.get('META_APP_ID');
    const appSecret = Deno.env.get('META_APP_SECRET');

    if (!appId || !appSecret) {
      return jsonResponse({ error: 'META_APP_ID or META_APP_SECRET not configured' }, 500);
    }

    const longLivedResp = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token?` +
        `grant_type=fb_exchange_token&` +
        `client_id=${appId}&` +
        `client_secret=${appSecret}&` +
        `fb_exchange_token=${encodeURIComponent(user_token)}`
    );

    const longLivedData = await longLivedResp.json();

    if (!longLivedResp.ok || longLivedData.error) {
      console.error('[meta-oauth] Long-lived token exchange failed:', longLivedData);
      return jsonResponse({ error: 'Failed to exchange for long-lived token', details: longLivedData }, 400);
    }

    const longLivedToken = longLivedData.access_token;

    // 2. Fetch pages the user manages
    const pagesResp = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,category,tasks,instagram_business_account{id,username}&access_token=${encodeURIComponent(longLivedToken)}`
    );

    const pagesData = await pagesResp.json();

    if (!pagesResp.ok || pagesData.error) {
      console.error('[meta-oauth] Fetch pages failed:', pagesData);
      return jsonResponse({ error: 'Failed to fetch pages', details: pagesData }, 400);
    }

    const pages: MetaPage[] = pagesData.data || [];

    if (pages.length === 0) {
      return jsonResponse({ error: 'No pages found for this user. Make sure you manage at least one Facebook Page.' }, 400);
    }

    // 3. Get Supabase admin client for DB operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: 'Supabase not configured' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 4. Get or create client for this user
    // The user_token is the short-lived one from Supabase session, we need to get the user ID
    // We'll use the long-lived token to get the user's Facebook ID
    const meResp = await fetch(
      `https://graph.facebook.com/v20.0/me?fields=id&access_token=${encodeURIComponent(longLivedToken)}`
    );
    const meData = await meResp.json();
    const fbUserId = meData.id;

    if (!fbUserId) {
      return jsonResponse({ error: 'Could not get Facebook user ID' }, 400);
    }

    // Find or create wpm_clients row for this Supabase user
    // We need to match by the Supabase auth user - but we don't have that here
    // The frontend should pass the Supabase user ID
    // For now, we'll return the pages and let the frontend handle the upsert

    return jsonResponse({
      success: true,
      pages: pages.map(p => ({
        pageId: p.id,
        pageName: p.name,
        pageAccessToken: p.access_token,
        category: p.category,
        tasks: p.tasks,
        instagramBusinessAccount: p.instagram_business_account,
      })),
      longLivedUserToken: longLivedToken,
    });
  } catch (err) {
    console.error('[meta-oauth] Error:', err);
    return jsonResponse({ error: String(err) }, 500);
  }
});