export type WpmChatRole = 'system' | 'user' | 'assistant';

export interface WpmChatMessage {
  role: WpmChatRole;
  content: string;
}

export interface WpmBotContext {
  client: {
    id: string;
    name: string;
    industry: string | null;
    timezone: string | null;
    website_url: string | null;
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
    emergency_keywords: string[];
    lead_fields: unknown;
  } | null;
  knowledge: Array<{
    title: string;
    content_text: string | null;
  }>;
}

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

export function buildWpmSystemPrompt(context: WpmBotContext): string {
  const { client, botProfile, instructions } = context;
  const knowledgeText = context.knowledge
    .filter((item) => item.content_text?.trim())
    .map((item) => `### ${item.title}\n${item.content_text?.trim()}`)
    .join('\n\n');

  const baseRules = [
    'You are the AI DM agent for the business below.',
    'Answer only from the provided business context and conversation history.',
    'If the answer is unknown, ask a concise follow-up or offer human handoff.',
    'Do not claim bookings, payments, refunds, medical/legal advice, or staff approval unless explicitly provided.',
    'Collect lead details naturally. Do not interrogate the user.',
  ].join('\n');

  const parts = [
    section('Role', baseRules),
    section('Business', [
      `Client: ${client.name}`,
      client.industry ? `Industry: ${client.industry}` : null,
      client.timezone ? `Timezone: ${client.timezone}` : null,
      client.website_url ? `Website: ${client.website_url}` : null,
    ].filter(Boolean).join('\n')),
    section('Bot Profile', [
      botProfile.public_name ? `Public name: ${botProfile.public_name}` : null,
      `Tone: ${botProfile.tone}`,
      `Language: ${botProfile.language}`,
      `Response length: ${botProfile.response_length}`,
      botProfile.booking_url ? `Booking URL: ${botProfile.booking_url}` : null,
      botProfile.handoff_contact ? `Handoff contact: ${botProfile.handoff_contact}` : null,
    ].filter(Boolean).join('\n')),
    section('System Instructions', instructions?.system_prompt),
    section('Business Summary', instructions?.business_summary),
    section('FAQ / Operating Instructions', instructions?.faq_instructions),
    section('Lead Qualification', [
      instructions?.lead_qualification_instructions,
      instructions ? `Lead fields to collect: ${stringifyLeadFields(instructions.lead_fields)}` : null,
    ].filter(Boolean).join('\n')),
    section('Handoff Rules', [
      instructions?.handoff_rules,
      instructions?.emergency_keywords?.length ? `Emergency keywords: ${instructions.emergency_keywords.join(', ')}` : null,
    ].filter(Boolean).join('\n')),
    section('Never Say / Guardrails', instructions?.never_say_rules),
    section('Knowledge Base', knowledgeText),
  ];

  return parts.filter(Boolean).join('\n\n');
}

export function buildWpmAssistantMessages(
  context: WpmBotContext,
  recentMessages: WpmChatMessage[],
  inboundMessage: string,
): WpmChatMessage[] {
  const history = recentMessages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .filter((message) => message.content.trim())
    .slice(-12);

  return [
    { role: 'system', content: buildWpmSystemPrompt(context) },
    ...history,
    { role: 'user', content: inboundMessage },
  ];
}
