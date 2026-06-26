import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Verify caller is authenticated
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = await req.json();
  const channelId: string = body.channel_id;
  if (!channelId) return json({ error: "channel_id required" }, 400);

  // Fetch channel row
  const { data: channel, error: chanErr } = await adminClient
    .from("wpm_client_channels")
    .select("id, provider_channel_id, external_page_id, channel_type, page_access_token, metadata, client_id")
    .eq("id", channelId)
    .maybeSingle();

  if (chanErr || !channel) return json({ error: "Channel not found" }, 404);

  // Verify the channel belongs to this user's client
  const { data: clientRow } = await adminClient
    .from("wpm_clients")
    .select("id")
    .eq("id", channel.client_id)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!clientRow) return json({ error: "Forbidden" }, 403);

  if (!channel.page_access_token) {
    return json({ error: "No page access token stored for this channel. Reconnect via Meta." }, 400);
  }

  // For Instagram channels, the webhook subscription is on the linked FB Page (external_page_id).
  // For Facebook channels, the provider_channel_id is the Page ID directly.
  const pageId = channel.external_page_id || channel.provider_channel_id;

  try {
    const subResp = await fetch(
      `https://graph.facebook.com/v20.0/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks`,
      { method: "POST", headers: { Authorization: `Bearer ${channel.page_access_token}` } }
    );
    const subData = await subResp.json();
    const subscribed = subResp.ok && subData.success === true;

    // Persist updated webhook status so the badge stays accurate across page loads
    const updatedMetadata = {
      ...(channel.metadata || {}),
      webhook_subscribed: subscribed,
      webhook_verified_at: new Date().toISOString(),
    };
    await adminClient
      .from("wpm_client_channels")
      .update({ metadata: updatedMetadata })
      .eq("id", channelId);

    return json({ success: true, subscribed, page_id: pageId });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
