/**
 * meta-oauth-callback — Handle Meta (Facebook/Instagram) OAuth callback
 *
 * After Supabase OAuth completes, the frontend calls this function with:
 * - user_token: the short-lived Facebook user access token from the Supabase session
 * - supabase_user_id: the authenticated Supabase user's UUID
 *
 * This function:
 * 1. Exchanges the short-lived token for a 60-day long-lived token
 * 2. Fetches all Facebook Pages the user manages
 * 3. For each Page: upserts a wpm_client_channels row (channel_type: 'facebook')
 * 4. For each Page with a linked Instagram Business Account: upserts another row (channel_type: 'instagram')
 * 5. Returns a safe summary — no tokens are returned to the frontend
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
    const { user_token, supabase_user_id } = await request.json();

    if (!user_token) {
      return jsonResponse({ error: 'user_token required' }, 400);
    }
    if (!supabase_user_id) {
      return jsonResponse({ error: 'supabase_user_id required' }, 400);
    }

    const appId = Deno.env.get('META_APP_ID');
    const appSecret = Deno.env.get('META_APP_SECRET');

    if (!appId || !appSecret) {
      return jsonResponse({ error: 'META_APP_ID or META_APP_SECRET not configured' }, 500);
    }

    // 1. Exchange short-lived user token for long-lived token (60 days)
    const longLivedResp = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token` +
        `?grant_type=fb_exchange_token` +
        `&client_id=${appId}` +
        `&client_secret=${appSecret}` +
        `&fb_exchange_token=${encodeURIComponent(user_token)}`
    );

    const longLivedData = await longLivedResp.json();

    if (!longLivedResp.ok || longLivedData.error) {
      console.error('[meta-oauth] Long-lived token exchange failed:', longLivedData);
      return jsonResponse({ error: 'Failed to exchange for long-lived token', details: longLivedData }, 400);
    }

    const longLivedToken: string = longLivedData.access_token;

    // 2. Fetch pages the user manages (Authorization header, not query param)
    const pagesResp = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts` +
        `?fields=id,name,access_token,category,tasks,instagram_business_account{id,username}`,
      { headers: { Authorization: `Bearer ${longLivedToken}` } }
    );

    const pagesData = await pagesResp.json();

    if (!pagesResp.ok || pagesData.error) {
      console.error('[meta-oauth] Fetch pages failed:', pagesData);
      return jsonResponse({ error: 'Failed to fetch pages', details: pagesData }, 400);
    }

    const pages: MetaPage[] = pagesData.data || [];

    if (pages.length === 0) {
      return jsonResponse(
        { error: 'No Facebook Pages found. Make sure you manage at least one Facebook Page.' },
        400
      );
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

    // 4. Look up the wpm_clients row for this Supabase user
    const { data: clientRow, error: clientError } = await supabase
      .from('wpm_clients')
      .select('id')
      .eq('owner_user_id', supabase_user_id)
      .maybeSingle();

    if (clientError || !clientRow) {
      console.error('[meta-oauth] Could not find wpm_clients row:', clientError);
      return jsonResponse(
        { error: 'No client profile found for this user. Please complete onboarding first.' },
        400
      );
    }

    const clientId: string = clientRow.id;

    // 5. Upsert channels for each page
    const connectedChannels: { name: string; type: string }[] = [];

    for (const page of pages) {
      // Facebook Messenger channel
      const { error: fbError } = await supabase
        .from('wpm_client_channels')
        .upsert(
          {
            client_id: clientId,
            channel_type: 'facebook',
            provider: 'meta',
            provider_channel_id: page.id,
            external_page_id: page.id,
            display_name: page.name,
            page_access_token: page.access_token,
            is_active: true,
            metadata: { page_name: page.name, category: page.category, tasks: page.tasks },
          },
          { onConflict: 'provider,provider_channel_id,channel_type', ignoreDuplicates: false }
        );

      if (fbError) {
        console.error('[meta-oauth] Failed to upsert Facebook channel:', fbError);
      } else {
        connectedChannels.push({ name: page.name, type: 'facebook' });
      }

      // Instagram channel (if page has a linked Instagram Business Account)
      if (page.instagram_business_account?.id) {
        const igAccount = page.instagram_business_account;
        const { error: igError } = await supabase
          .from('wpm_client_channels')
          .upsert(
            {
              client_id: clientId,
              channel_type: 'instagram',
              provider: 'meta',
              provider_channel_id: igAccount.id,
              external_page_id: page.id,
              display_name: igAccount.username ? `@${igAccount.username}` : page.name,
              page_access_token: page.access_token,
              is_active: true,
              metadata: {
                ig_user_id: igAccount.id,
                ig_username: igAccount.username,
                facebook_page_id: page.id,
              },
            },
            { onConflict: 'provider,provider_channel_id,channel_type', ignoreDuplicates: false }
          );

        if (igError) {
          console.error('[meta-oauth] Failed to upsert Instagram channel:', igError);
        } else {
          connectedChannels.push({
            name: igAccount.username ? `@${igAccount.username}` : page.name,
            type: 'instagram',
          });
        }
      }
    }

    return jsonResponse({
      success: true,
      pagesConnected: connectedChannels.length,
      channels: connectedChannels,
    });
  } catch (err) {
    console.error('[meta-oauth] Error:', err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
