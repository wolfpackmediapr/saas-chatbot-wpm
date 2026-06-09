import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildWpmSystemPrompt, buildWpmAssistantMessages, type WpmBotContext, type WpmChatMessage } from "../_shared/wpm_prompt.ts";
import { extractLeadFromConversationText, persistQualifiedLeadAndQueueActions } from "../_shared/wpm_leads.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

const RESPONSE_LENGTH_TOKENS: Record<string, number> = {
  concise: 280,
  balanced: 550,
  detailed: 950,
};

// ─── Handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  // ── Guard: OpenAI key must exist server-side ───────────────────────────────
  const openAIKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAIKey) {
    return err("OpenAI not configured — OPENAI_API_KEY is missing from edge function secrets.", 503);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Auth: verify user JWT ──────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return err("Missing Authorization header", 401);

  // User-scoped client for RLS-guarded reads
  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !user) return err("Not authenticated", 401);

  // Service-role client for writes (conversations, messages, leads)
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { messages?: Array<{ role: string; content: string }>; conversationId?: string };
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const conversationHistory: Array<{ role: string; content: string }> = body.messages ?? [];
  const lastUserMsg = [...conversationHistory].reverse().find((m) => m.role === "user");
  if (!lastUserMsg) return err("No user message found in messages array");

  // ── Load business client (RLS ensures only owner can read) ────────────────
  const { data: clientData, error: clientErr } = await supabaseUser
    .from("wpm_clients")
    .select("id, name, description, services, location, industry, timezone, website_url, contact_email, contact_phone")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (clientErr) return err(`Failed to load business profile: ${clientErr.message}`, 500);
  if (!clientData) {
    return err("No business profile found. Complete Business Profile setup first.", 404);
  }

  const client = clientData as Record<string, any>;

  // ── Load active bot profile ────────────────────────────────────────────────
  const { data: botProfileData } = await supabaseUser
    .from("wpm_bot_profiles")
    .select("id, public_name, tone, language, response_length, booking_url, handoff_contact, model_provider, model_name")
    .eq("client_id", client.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rawBotProfile = (botProfileData as Record<string, any> | null) ?? {};
  const botProfile = {
    id: rawBotProfile.id ?? "",
    public_name: rawBotProfile.public_name ?? null,
    tone: rawBotProfile.tone ?? "Professional & Friendly",
    language: rawBotProfile.language ?? "en",
    response_length: rawBotProfile.response_length ?? "balanced",
    booking_url: rawBotProfile.booking_url ?? null,
    handoff_contact: rawBotProfile.handoff_contact ?? null,
    model_provider: rawBotProfile.model_provider ?? "openai",
    model_name: rawBotProfile.model_name ?? "gpt-4o-mini",
  };

  // ── Load bot instructions ──────────────────────────────────────────────────
  let instructions: Record<string, any> | null = null;
  if (botProfile.id) {
    const { data: instrData } = await supabaseUser
      .from("wpm_bot_instructions")
      .select("system_prompt, business_summary, faq_instructions, lead_qualification_instructions, handoff_rules, never_say_rules, primary_goal, response_language, emergency_keywords, lead_fields")
      .eq("bot_profile_id", botProfile.id)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    instructions = instrData as Record<string, any> | null;
  }

  // ── Load knowledge base ────────────────────────────────────────────────────
  const { data: knowledgeData } = await supabaseUser
    .from("wpm_knowledge_sources")
    .select("title, content_text")
    .eq("client_id", client.id)
    .eq("status", "ready")
    .order("updated_at", { ascending: false })
    .limit(10);

  const knowledge: Array<{ title: string; content_text: string | null }> =
    (knowledgeData as any[] | null) ?? [];

  // ── Build WpmBotContext for the shared prompt builder ─────────────────────
  const context: WpmBotContext = {
    client: {
      id: client.id,
      name: client.name ?? "",
      description: client.description ?? null,
      services: client.services ?? null,
      location: client.location ?? null,
      industry: client.industry ?? null,
      timezone: client.timezone ?? null,
      website_url: client.website_url ?? null,
      contact_email: client.contact_email ?? null,
      contact_phone: client.contact_phone ?? null,
    },
    botProfile,
    instructions: instructions
      ? {
          system_prompt: instructions.system_prompt ?? "",
          business_summary: instructions.business_summary ?? null,
          faq_instructions: instructions.faq_instructions ?? null,
          lead_qualification_instructions: instructions.lead_qualification_instructions ?? null,
          handoff_rules: instructions.handoff_rules ?? null,
          never_say_rules: instructions.never_say_rules ?? null,
          primary_goal: instructions.primary_goal ?? null,
          response_language: instructions.response_language ?? null,
          emergency_keywords: instructions.emergency_keywords ?? [],
          lead_fields: instructions.lead_fields ?? null,
        }
      : null,
    knowledge,
  };

  // ── Upsert test conversation for persistence ───────────────────────────────
  let conversationId: string | null = body.conversationId ?? null;

  if (!conversationId) {
    const externalConversationId = "test-preview";
    const { data: convData } = await supabaseAdmin
      .from("wpm_conversations")
      .upsert(
        {
          client_id: client.id,
          channel_id: null,
          bot_profile_id: botProfile.id || null,
          external_conversation_id: externalConversationId,
          external_user_id: user.id,
          channel_type: "test",
          status: "active",
          last_message_at: new Date().toISOString(),
        },
        { onConflict: "client_id,channel_type,external_conversation_id,external_user_id" },
      )
      .select("id")
      .single();
    conversationId = (convData as { id: string } | null)?.id ?? null;
  } else {
    // Update last_message_at on existing conversation
    await supabaseAdmin
      .from("wpm_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);
  }

  // ── Persist inbound user message ───────────────────────────────────────────
  if (conversationId) {
    await supabaseAdmin.from("wpm_messages").insert({
      conversation_id: conversationId,
      client_id: client.id,
      direction: "inbound",
      role: "user",
      content: lastUserMsg.content,
      metadata: { source: "test_agent", user_id: user.id },
    });
  }

  // ── Build OpenAI message array using shared builder ────────────────────────
  // Convert history (excluding the last user message which we append via buildWpmAssistantMessages)
  const historyWithoutLastUser: WpmChatMessage[] = conversationHistory
    .slice(0, -1) // drop the last user message — buildWpmAssistantMessages appends it
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const openAIMessages = buildWpmAssistantMessages(context, historyWithoutLastUser, lastUserMsg.content);

  const maxTokens = RESPONSE_LENGTH_TOKENS[botProfile.response_length] ?? 550;

  // ── Call OpenAI ────────────────────────────────────────────────────────────
  let openAIResponse: Response;
  try {
    openAIResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAIKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: botProfile.model_name,
        messages: openAIMessages,
        temperature: 0.45,
        max_tokens: maxTokens,
      }),
    });
  } catch (fetchErr: any) {
    return err(`OpenAI request failed: ${fetchErr?.message ?? fetchErr}`, 502);
  }

  const openAIData = await openAIResponse.json();

  if (!openAIResponse.ok) {
    const msg = openAIData?.error?.message ?? `OpenAI error ${openAIResponse.status}`;
    return err(msg, 502);
  }

  const assistantContent: string = openAIData.choices?.[0]?.message?.content ?? "";
  if (!assistantContent.trim()) return err("OpenAI returned an empty response", 502);

  const reply = assistantContent.trim();

  // ── Persist assistant reply ────────────────────────────────────────────────
  if (conversationId) {
    await supabaseAdmin.from("wpm_messages").insert({
      conversation_id: conversationId,
      client_id: client.id,
      direction: "outbound",
      role: "assistant",
      content: reply,
      model_provider: "openai",
      model_name: openAIData.model ?? botProfile.model_name,
      token_usage: openAIData.usage ?? null,
      metadata: { source: "test_agent", generated_by: "wpm-test-chat" },
    });

    // Update last_message_at
    await supabaseAdmin
      .from("wpm_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);
  }

  // ── Lead extraction & persistence ─────────────────────────────────────────
  try {
    const lead = extractLeadFromConversationText({
      inboundText: lastUserMsg.content,
      assistantText: reply,
      sourceChannel: "test",
    });

    if (lead.isQualified && conversationId) {
      await persistQualifiedLeadAndQueueActions({
        supabase: supabaseAdmin,
        clientId: client.id,
        conversationId,
        lead,
      });
    }
  } catch (_leadErr) {
    // Lead extraction is best-effort — never fail the response
  }

  return ok({
    reply,
    conversationId,
    model: openAIData.model ?? botProfile.model_name,
    usage: openAIData.usage ?? null,
    context: {
      businessName: client.name,
      tone: botProfile.tone,
      knowledgeItems: knowledge.length,
      primaryGoal: instructions?.primary_goal ?? "Book a Calendly meeting",
      responseLanguage: instructions?.response_language ?? "English + Latin American Spanish",
    },
  });
});
