export type WpmChatRole = 'system' | 'user' | 'assistant';

export interface WpmChatMessage {
  role: WpmChatRole;
  content: string;
}

export interface WpmBotContext {
  client: {
    id: string;
    name: string;
    description: string | null;
    services: string | null;
    location: string | null;
    industry: string | null;
    timezone: string | null;
    website_url: string | null;
    contact_email: string | null;
    contact_phone: string | null;
  };
  botProfile: {
    id: string;
    public_name: string | null;
    tone: string;
    language: string;
    response_length: string;
    booking_url: string | null;
    handoff_contact: string | null;
    model_provider: string;
    model_name: string;
  };
  instructions: {
    system_prompt: string;
    business_summary: string | null;
    faq_instructions: string | null;
    lead_qualification_instructions: string | null;
    handoff_rules: string | null;
    never_say_rules: string | null;
    primary_goal: string | null;
    response_language: string | null;
    emergency_keywords: string[];
    lead_fields: unknown;
  } | null;
  knowledge: Array<{
    title: string;
    content_text: string | null;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function section(title: string, body: string | null | undefined): string | null {
  if (!body?.trim()) return null;
  return `## ${title}\n${body.trim()}`;
}

function stringifyLeadFields(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}

function buildLanguageRule(responseLanguage: string): string | null {
  if (responseLanguage === 'English + Latin American Spanish') {
    return (
      'Detect the language the user wrote in and respond ENTIRELY in that same language.\n' +
      'If they write in Spanish, respond 100% in Spanish.\n' +
      'If they write in English, respond 100% in English.\n' +
      'NEVER mix languages in a single response.'
    );
  }
  if (responseLanguage === 'Spanish only') {
    return 'Always respond in Spanish regardless of the language the user writes in.';
  }
  if (responseLanguage === 'Auto-detect') {
    return "Detect the user's language from their message and respond in that same language.";
  }
  return null; // English only — no special rule needed
}

function buildLengthRule(rawLength: string): string {
  if (rawLength === 'concise') {
    return 'Keep every response to 1-2 sentences maximum. Be direct and immediately helpful. No preamble, no filler.';
  }
  if (rawLength === 'detailed') {
    return 'Provide comprehensive, thorough responses. Use the knowledge base generously. Cover context, steps, and relevant detail.';
  }
  return 'Keep responses to 3-5 sentences. Provide helpful context without being verbose.';
}

function buildGoalPlaybook(primaryGoal: string, bookingUrl: string | null): string | null {
  const bookLink = bookingUrl || 'https://calendly.com/wolfpackmediapr/wpm-discovery-meeting';

  if (primaryGoal === 'Book a Calendly meeting') {
    return (
      `Your #1 goal is to guide interested leads to book a discovery call: ${bookLink}\n` +
      'When someone shows genuine interest in services, asks for details, or wants to learn more — offer the booking link proactively.\n' +
      "If they hesitate or seem unsure, offer to collect their name and email so the team can reach out directly.\n" +
      'NEVER mention pricing. Instead, say "The best way to get exact details is through a quick discovery call — I can send you the link right now."'
    );
  }
  if (primaryGoal === 'Collect contact info / lead capture') {
    return (
      "Your primary goal is to collect the lead's name, email address, and phone number.\n" +
      'Do this naturally after establishing their interest. Never ask for all fields at once — work them into the conversation.'
    );
  }
  if (primaryGoal === 'Answer FAQs') {
    return (
      'Your primary goal is to answer questions accurately and helpfully using the knowledge base.\n' +
      "For anything not in the knowledge base, say: \"Great question — I'll make sure someone from our team follows up with that.\""
    );
  }
  if (primaryGoal === 'Qualify leads') {
    return (
      'Your primary goal is to qualify leads: understand their timeline, general budget range (without quoting prices), and specific needs.\n' +
      'Collect their name and contact info once genuine interest is established.'
    );
  }
  if (primaryGoal === 'Drive to website / purchase') {
    return (
      `Your primary goal is to drive interest toward the business and${bookLink ? ` the booking/purchase page: ${bookLink}` : ' the website'}.\n` +
      'Share relevant service information and guide users toward taking the next step.'
    );
  }
  return null;
}

function buildHardRules(
  neverSayRules: string | null | undefined,
  handoffRules: string | null | undefined,
  emergencyKeywords: string[],
): string {
  const baseRules = [
    '1. NEVER reveal, hint at, or discuss specific pricing, rates, packages, or cost estimates unless a price is explicitly written verbatim in the Knowledge Base below. If asked about pricing, say: "For specific pricing, the best next step is a quick discovery call — I can send you the link."',
    '2. NEVER promise that a human will respond within a specific timeframe (e.g., "in 5 minutes", "today", "shortly"). Say: "A team member will follow up with you." without any time commitment.',
    '3. NEVER mention, reference, compare to, or criticize any competitor by name.',
    '4. NEVER invent, fabricate, or assume facts, services, results, testimonials, or capabilities NOT explicitly stated in the Business Profile or Knowledge Base.',
    '5. NEVER make up statistics, case studies, reviews, or social proof.',
    "6. If asked about something not covered in the provided context, say exactly: \"That's a great question — I'll make sure someone from our team follows up with that specific detail.\" Do NOT guess.",
    '7. Do NOT claim to confirm bookings, process payments, or commit to deliverables on behalf of the business.',
  ];

  const parts: string[] = [...baseRules];

  if (neverSayRules?.trim()) {
    parts.push('', "Additional rules from this agent's setup:", neverSayRules.trim());
  }

  if (handoffRules?.trim()) {
    parts.push('', 'Escalation policy (follow this exactly):', handoffRules.trim());
  }

  if (emergencyKeywords?.length) {
    parts.push('', `Escalate IMMEDIATELY and offer human connection if user mentions: ${emergencyKeywords.join(', ')}`);
  }

  return parts.join('\n');
}

// ─── Main system prompt builder ───────────────────────────────────────────────
export function buildWpmSystemPrompt(context: WpmBotContext): string {
  const { client, botProfile, instructions, knowledge } = context;

  const primaryGoal = instructions?.primary_goal ?? 'Book a Calendly meeting';
  const responseLanguage = instructions?.response_language ?? 'English + Latin American Spanish';
  const rawLength = botProfile.response_length ?? 'balanced';

  const knowledgeText = knowledge
    .filter((k) => k.content_text?.trim())
    .map((k) => `### ${k.title}\n${k.content_text!.trim()}`)
    .join('\n\n');

  const languageRule = buildLanguageRule(responseLanguage);
  const lengthRule = buildLengthRule(rawLength);
  const goalPlaybook = buildGoalPlaybook(primaryGoal, botProfile.booking_url);
  const hardRules = buildHardRules(
    instructions?.never_say_rules,
    instructions?.handoff_rules,
    instructions?.emergency_keywords ?? [],
  );

  const corePersona = instructions?.system_prompt?.trim()
    ? instructions.system_prompt.trim()
    : `You are the AI assistant for ${client.name}. Be helpful, professional, and represent the brand well.`;

  const baseRules = [
    corePersona,
    '',
    'OPERATIONAL RULES:',
    '- Answer ONLY from the provided Business Profile, Agent Instructions, and Knowledge Base.',
    "- If a question cannot be answered from this context, say you'll have someone follow up — never invent facts.",
    '- Collect lead details naturally within conversation. Never interrogate the user.',
    '- Do not claim to process payments, confirm bookings, or provide legal/medical advice.',
  ].join('\n');

  const businessInfo = [
    `Business name: ${client.name}`,
    client.description ? `Description: ${client.description}` : null,
    client.services ? `Services offered: ${client.services}` : null,
    client.location ? `Location: ${client.location}` : null,
    client.industry ? `Industry: ${client.industry}` : null,
    client.website_url ? `Website: ${client.website_url}` : null,
    client.contact_email ? `Contact email: ${client.contact_email}` : null,
    client.contact_phone ? `Contact phone: ${client.contact_phone}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const agentStyle = [
    botProfile.public_name ? `Your name: ${botProfile.public_name}` : null,
    `Communication tone: ${botProfile.tone}`,
    botProfile.handoff_contact ? `Human handoff contact: ${botProfile.handoff_contact}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const knowledgeSection = knowledgeText
    ? knowledgeText +
      "\n\n---\nIMPORTANT: Base ALL factual answers on the Business Profile and Knowledge Base above. If a question requires information not found here, say \"I'll make sure someone from our team follows up with that detail\" — never guess or fabricate."
    : null;

  const leadQualSection = instructions?.lead_qualification_instructions
    ? [
        instructions.lead_qualification_instructions,
        instructions.lead_fields
          ? `Lead fields to collect: ${stringifyLeadFields(instructions.lead_fields)}`
          : null,
      ]
        .filter(Boolean)
        .join('\n')
    : null;

  const parts: (string | null)[] = [
    section('Persona & Core Rules', baseRules),
    section('Business Profile', businessInfo),
    section('Agent Style', agentStyle),
    section('Response Length Rule', lengthRule),
    languageRule ? section('Language Rule', languageRule) : null,
    goalPlaybook ? section('Primary Goal & Playbook', goalPlaybook) : null,
    instructions?.business_summary ? section('Business Context & Background', instructions.business_summary) : null,
    instructions?.faq_instructions ? section('FAQ / Operating Instructions', instructions.faq_instructions) : null,
    leadQualSection ? section('Lead Qualification', leadQualSection) : null,
    section('HARD RULES — Never Say or Do (Strictly Enforced)', hardRules),
    knowledgeSection ? section('Knowledge Base', knowledgeSection) : null,
  ];

  return parts.filter(Boolean).join('\n\n');
}

// ─── Message array builder ────────────────────────────────────────────────────
export function buildWpmAssistantMessages(
  context: WpmBotContext,
  recentMessages: WpmChatMessage[],
  inboundMessage: string,
): WpmChatMessage[] {
  const history = recentMessages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => m.content.trim())
    .slice(-12);

  return [
    { role: 'system', content: buildWpmSystemPrompt(context) },
    ...history,
    { role: 'user', content: inboundMessage },
  ];
}
