import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

// ─── System prompt builder ────────────────────────────────────────────────────
function section(title: string, body: string | null | undefined): string | null {
  if (!body?.trim()) return null;
  return `## ${title}\n${body.trim()}`;
}

function buildSystemPrompt(opts: {
  client: Record<string, any>;
  botProfile: Record<string, any>;
  instructions: Record<string, any> | null;
  knowledge: Array<{ title: string; content_text: string | null }>;
  primaryGoal: string;
  responseLanguage: string;
}): string {
  const { client, botProfile, instructions, knowledge, primaryGoal, responseLanguage } = opts;

  const knowledgeText = knowledge
    .filter((k) => k.content_text?.trim())
    .map((k) => `### ${k.title}\n${k.content_text!.trim()}`)
    .join("\n\n");

  const baseRules = [
    "You are the AI DM agent for the business described below.",
    "Answer using the provided business context and knowledge base.",
    "If the answer is unknown, ask a concise follow-up or offer human handoff.",
    "Never claim to make bookings, process payments, or give legal/medical advice.",
    "Collect lead details naturally — do not interrogate the user.",
  ].join("\n");

  const services = client.services
    ? `Services: ${client.services}`
    : null;

  const parts = [
    section("Role", baseRules),
    section("Business", [
      `Business name: ${client.name}`,
      client.description ? `Description: ${client.description}` : null,
      services,
      client.location ? `Location: ${client.location}` : null,
      client.website_url ? `Website: ${client.website_url}` : null,
      client.contact_email ? `Contact email: ${client.contact_email}` : null,
      client.contact_phone ? `Contact phone: ${client.contact_phone}` : null,
    ].filter(Boolean).join("\n")),
    section("Agent Behavior", [
      botProfile.tone ? `Tone: ${botProfile.tone}` : null,
      botProfile.response_length ? `Response length: ${botProfile.response_length}` : null,
      `Primary goal: ${primaryGoal}`,
      `Response language: ${responseLanguage}`,
    ].filter(Boolean).join("\n")),
    instructions?.system_prompt ? section("Core Instructions", instructions.system_prompt) : null,
    instructions?.business_summary ? section("Business Summary", instructions.business_summary) : null,
    instructions?.lead_qualification_instructions
      ? section("Lead Qualification", instructions.lead_qualification_instructions)
      : null,
    instructions?.handoff_rules ? section("Escalation / Handoff Rules", instructions.handoff_rules) : null,
    instructions?.never_say_rules
      ? section("HARD RULES — Never Say or Do", instructions.never_say_rules)
      : null,
    knowledgeText ? section("Knowledge Base", knowledgeText) : null,
  ];

  return parts.filter(Boolean).join("\n\n");
}

// ─── Handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const openAIKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAIKey) {
    return err("OpenAI not configured — add OPENAI_API_KEY to edge function secrets.", 503);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Parse JWT from Authorization header to identify the calling user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return err("Missing Authorization header", 401);

  // Use anon key + user JWT to enforce RLS (user can only read their own client)
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
  });

  // Verify the user
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return err("Not authenticated", 401);

  let body: { messages?: Array<{ role: string; content: string }> };
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const conversationHistory: Array<{ role: string; content: string }> = body.messages ?? [];
  const lastUserMessage = [...conversationHistory].reverse().find((m) => m.role === "user");
  if (!lastUserMessage) return err("No user message provided");

  // ── Load client ────────────────────────────────────────────────────────────
  const { data: clientData, error: clientErr } = await supabase
    .from("wpm_clients")
    .select("id, name, description, services, location, timezone, website_url, contact_email, contact_phone, industry")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (clientErr) return err(`Failed to load client: ${clientErr.message}`, 500);
  if (!clientData) return err("No business profile found. Complete Business Profile setup first.", 404);

  const client = clientData as Record<string, any>;

  // ── Load active bot profile ────────────────────────────────────────────────
  const { data: botProfileData } = await supabase
    .from("wpm_bot_profiles")
    .select("id, tone, response_length, settings")
    .eq("client_id", client.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const botProfile = (botProfileData as Record<string, any> | null) ?? {};

  // ── Load bot instructions ──────────────────────────────────────────────────
  let instructions: Record<string, any> | null = null;
  if (botProfile.id) {
    const { data: instrData } = await supabase
      .from("wpm_bot_instructions")
      .select("system_prompt, business_summary, faq_instructions, lead_qualification_instructions, handoff_rules, never_say_rules, primary_goal, response_language")
      .eq("bot_profile_id", botProfile.id)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    instructions = instrData as Record<string, any> | null;
  }

  // ── Load knowledge base ────────────────────────────────────────────────────
  const { data: knowledgeData } = await supabase
    .from("wpm_knowledge_sources")
    .select("title, content_text")
    .eq("client_id", client.id)
    .eq("status", "ready")
    .order("updated_at", { ascending: false })
    .limit(10);

  const knowledge: Array<{ title: string; content_text: string | null }> =
    (knowledgeData as any[] | null) ?? [];

  const primaryGoal = instructions?.primary_goal ?? "Book a Calendly meeting";
  const responseLanguage = instructions?.response_language ?? "English + Latin American Spanish";

  // ── Build messages for OpenAI ──────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt({ client, botProfile, instructions, knowledge, primaryGoal, responseLanguage });

  const responseLengthMap: Record<string, number> = {
    concise: 250,
    balanced: 500,
    detailed: 900,
  };
  const rawLength = botProfile.response_length ?? "balanced";
  const maxTokens = responseLengthMap[rawLength] ?? 500;

  // Build message array: system + up to 12 turns of history (minus last user which we append)
  const historyMessages = conversationHistory
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => m.content.trim())
    .slice(-13) // keep last 13 so when we trim below we have room
    .map((m) => ({ role: m.role, content: m.content }));

  const openAIMessages = [
    { role: "system", content: systemPrompt },
    ...historyMessages,
  ];

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
        model: "gpt-4o-mini",
        messages: openAIMessages,
        temperature: 0.45,
        max_tokens: maxTokens,
      }),
    });
  } catch (fetchErr: any) {
    return err(`OpenAI request failed: ${fetchErr.message}`, 502);
  }

  const openAIData = await openAIResponse.json();

  if (!openAIResponse.ok) {
    const msg = openAIData?.error?.message ?? `OpenAI error ${openAIResponse.status}`;
    return err(msg, 502);
  }

  const assistantContent: string = openAIData.choices?.[0]?.message?.content ?? "";
  if (!assistantContent.trim()) return err("OpenAI returned an empty response", 502);

  return ok({
    reply: assistantContent.trim(),
    model: openAIData.model ?? "gpt-4o-mini",
    usage: openAIData.usage ?? null,
    context: {
      businessName: client.name,
      tone: botProfile.tone ?? null,
      knowledgeItems: knowledge.length,
      primaryGoal,
      responseLanguage,
    },
  });
});
