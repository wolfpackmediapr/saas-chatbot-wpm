export type AgentResponseLength = 'concise' | 'balanced' | 'detailed';

export interface AgentTemplate {
  key: string;
  label: string;
  description: string;
  tone: string;
  systemPrompt: string;
  leadQualificationInstructions: string;
  handoffRules: string;
  neverSayRules: string;
  leadFields: string[];
  emergencyKeywords: string[];
}

export interface AgentSetupInput {
  id?: string;
  instruction_id?: string;
  template_key?: string;
  name: string;
  public_name?: string;
  tone?: string;
  language?: string;
  response_length?: AgentResponseLength;
  booking_url?: string;
  handoff_contact?: string;
  system_prompt: string;
  business_summary?: string;
  faq_instructions?: string;
  lead_qualification_instructions?: string;
  handoff_rules?: string;
  never_say_rules?: string;
  emergency_keywords?: string | string[];
  lead_fields?: string | string[];
}

export interface AgentSetupValidationErrors {
  template_key?: string;
  name?: string;
  system_prompt?: string;
  booking_url?: string;
}

export interface AgentSetupCompletion {
  completed: number;
  total: number;
  percentComplete: number;
  blockers: string[];
  ready: boolean;
}

export interface AgentProfilePayload {
  id?: string;
  client_id: string;
  name: string;
  public_name: string | null;
  template_key: string | null;
  model_provider: 'openai';
  model_name: 'gpt-4.1-mini';
  tone: string;
  language: string;
  response_length: AgentResponseLength;
  booking_url: string | null;
  handoff_contact: string | null;
  is_active: true;
  settings: {
    self_setup: true;
  };
}

export interface AgentInstructionPayload {
  id?: string;
  bot_profile_id: string;
  system_prompt: string;
  business_summary: string | null;
  faq_instructions: string | null;
  lead_qualification_instructions: string | null;
  handoff_rules: string | null;
  never_say_rules: string | null;
  emergency_keywords: string[];
  lead_fields: string[];
  version: 1;
  is_active: true;
}

const DEFAULT_LANGUAGE = 'en';
const DEFAULT_RESPONSE_LENGTH: AgentResponseLength = 'balanced';

const TEMPLATES: AgentTemplate[] = [
  {
    key: 'restaurant-hospitality',
    label: 'Restaurant / Hospitality',
    description: 'Reservations, hours, menus, events, catering, VIP or birthday inquiries.',
    tone: 'warm, concise, hospitality-first',
    systemPrompt: 'You are an AI receptionist for a restaurant or hospitality business. Answer quickly, collect booking details, and route qualified requests.',
    leadQualificationInstructions: 'Ask for name, phone, party size, desired date/time, and service interest before sending a booking or event lead.',
    handoffRules: 'Escalate complaints, allergy concerns, manager requests, custom event packages, or urgent same-day issues.',
    neverSayRules: 'Never guarantee availability, pricing, or policy exceptions unless provided in the business knowledge.',
    leadFields: ['name', 'phone', 'party_size', 'date_time', 'service_interest'],
    emergencyKeywords: ['allergy', 'urgent', 'manager'],
  },
  {
    key: 'beauty-spa',
    label: 'Beauty / Spa',
    description: 'Services, pricing, booking requests, promos, consultations, aftercare.',
    tone: 'friendly, polished, confidence-building',
    systemPrompt: 'You are an AI front desk agent for a beauty, wellness, or spa business. Help clients pick services and request appointments.',
    leadQualificationInstructions: 'Collect name, phone, desired service, preferred date/time, and whether this is a first visit.',
    handoffRules: 'Escalate allergic reactions, refund complaints, corrections, or medical concerns.',
    neverSayRules: 'Never provide medical advice or guarantee results.',
    leadFields: ['name', 'phone', 'service_interest', 'date_time', 'first_visit'],
    emergencyKeywords: ['reaction', 'infection', 'refund', 'urgent'],
  },
  {
    key: 'medical-dental',
    label: 'Medical / Dental',
    description: 'Appointment requests, service explanation, basic intake, insurance routing, handoff.',
    tone: 'calm, clear, compliant',
    systemPrompt: 'You are an AI intake assistant for a medical or dental office. Provide general information and collect appointment-request details.',
    leadQualificationInstructions: 'Collect name, phone, service requested, preferred appointment time, and whether it is urgent. Do not collect sensitive diagnosis details unless explicitly required by policy.',
    handoffRules: 'Escalate emergencies, pain, legal complaints, insurance disputes, diagnosis questions, or medication questions.',
    neverSayRules: 'Never diagnose, prescribe, or replace professional medical advice.',
    leadFields: ['name', 'phone', 'service_interest', 'date_time', 'urgency'],
    emergencyKeywords: ['emergency', 'pain', 'bleeding', 'chest pain', 'diagnosis'],
  },
  {
    key: 'home-services',
    label: 'Home Services',
    description: 'Quote requests, service area, urgency, photos, booking, dispatch handoff.',
    tone: 'practical, fast, reassuring',
    systemPrompt: 'You are an AI quote intake agent for a home services business. Qualify the job and route quote requests clearly.',
    leadQualificationInstructions: 'Collect name, phone, address/service area, issue type, urgency, photos if available, and preferred appointment window.',
    handoffRules: 'Escalate emergencies, safety issues, property damage, angry customers, or same-day dispatch requests.',
    neverSayRules: 'Never guarantee exact pricing or arrival times unless provided by business policy.',
    leadFields: ['name', 'phone', 'address', 'service_interest', 'urgency'],
    emergencyKeywords: ['flood', 'fire', 'leak', 'emergency', 'no power'],
  },
  {
    key: 'professional-services',
    label: 'Professional Services',
    description: 'Consultation booking, service matching, qualification, CRM-ready lead capture.',
    tone: 'sharp, premium, direct',
    systemPrompt: 'You are an AI consultation intake agent. Identify the prospect need, qualify fit, and route serious leads to book a call.',
    leadQualificationInstructions: 'Collect name, email, company, service interest, timeline, budget range when appropriate, and booking intent.',
    handoffRules: 'Escalate enterprise requests, angry customers, legal/financial advice requests, or high-value opportunities.',
    neverSayRules: 'Never promise results, legal outcomes, financial returns, or custom scope without human confirmation.',
    leadFields: ['name', 'email', 'company', 'service_interest', 'timeline', 'budget'],
    emergencyKeywords: ['urgent', 'lawsuit', 'contract', 'refund', 'complaint'],
  },
  {
    key: 'ecommerce-product',
    label: 'Ecommerce / Product Brand',
    description: 'Product questions, order support routing, recommendations, promos, lead capture.',
    tone: 'helpful, concise, conversion-focused',
    systemPrompt: 'You are an AI product concierge for an ecommerce brand. Answer product questions and route order support or buying intent.',
    leadQualificationInstructions: 'Collect name, email/phone, product interest, order number when relevant, and purchase timeline.',
    handoffRules: 'Escalate refunds, shipping complaints, damaged orders, payment issues, or wholesale inquiries.',
    neverSayRules: 'Never invent inventory, shipping timelines, discounts, or return policy exceptions.',
    leadFields: ['name', 'email', 'product_interest', 'order_number', 'issue_type'],
    emergencyKeywords: ['refund', 'damaged', 'chargeback', 'missing order'],
  },
  {
    key: 'custom',
    label: 'Custom',
    description: 'Blank setup for clients who need custom instructions.',
    tone: 'professional, concise, helpful',
    systemPrompt: 'You are an AI DM agent. Answer accurately from business knowledge, qualify leads, and escalate when needed.',
    leadQualificationInstructions: 'Collect the minimum information needed to qualify the lead and route it to the right destination.',
    handoffRules: 'Escalate urgent, sensitive, angry, or unclear requests to a human.',
    neverSayRules: 'Never invent facts, prices, policies, or guarantees that are not in the business knowledge.',
    leadFields: ['name', 'email', 'phone', 'service_interest'],
    emergencyKeywords: ['urgent', 'emergency', 'complaint'],
  },
];

function clean(value?: string): string {
  return value?.trim() ?? '';
}

function splitList(value?: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value.map(clean).filter(Boolean);
  }

  return clean(value)
    .split(',')
    .map(clean)
    .filter(Boolean);
}

export function listAgentTemplates(): AgentTemplate[] {
  return TEMPLATES;
}

export function getAgentTemplate(templateKey?: string): AgentTemplate | undefined {
  return TEMPLATES.find((template) => template.key === templateKey);
}

export function normalizeBookingUrl(url?: string): string | null {
  const value = clean(url);
  if (!value) return null;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/$/, '');
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.includes('.');
  } catch {
    return false;
  }
}

export function validateAgentSetupInput(input: Partial<AgentSetupInput>): AgentSetupValidationErrors {
  const errors: AgentSetupValidationErrors = {};

  if (!clean(input.template_key)) {
    errors.template_key = 'Choose an agent template.';
  }

  if (!clean(input.name)) {
    errors.name = 'Agent name is required.';
  }

  if (!clean(input.system_prompt)) {
    errors.system_prompt = 'Core instructions are required.';
  }

  const bookingUrl = normalizeBookingUrl(input.booking_url);
  if (bookingUrl && !isValidUrl(bookingUrl)) {
    errors.booking_url = 'Booking URL must be valid.';
  }

  return errors;
}

export function buildAgentProfilePayload(input: AgentSetupInput, clientId: string): AgentProfilePayload {
  const payload: AgentProfilePayload = {
    client_id: clientId,
    name: clean(input.name),
    public_name: clean(input.public_name) || null,
    template_key: clean(input.template_key) || null,
    model_provider: 'openai',
    model_name: 'gpt-4.1-mini',
    tone: clean(input.tone) || 'professional',
    language: clean(input.language) || DEFAULT_LANGUAGE,
    response_length: input.response_length ?? DEFAULT_RESPONSE_LENGTH,
    booking_url: normalizeBookingUrl(input.booking_url),
    handoff_contact: clean(input.handoff_contact) || null,
    is_active: true,
    settings: {
      self_setup: true,
    },
  };

  if (input.id) payload.id = input.id;

  return payload;
}

export function buildAgentInstructionPayload(input: AgentSetupInput, botProfileId: string): AgentInstructionPayload {
  const payload: AgentInstructionPayload = {
    bot_profile_id: botProfileId,
    system_prompt: clean(input.system_prompt),
    business_summary: clean(input.business_summary) || null,
    faq_instructions: clean(input.faq_instructions) || null,
    lead_qualification_instructions: clean(input.lead_qualification_instructions) || null,
    handoff_rules: clean(input.handoff_rules) || null,
    never_say_rules: clean(input.never_say_rules) || null,
    emergency_keywords: splitList(input.emergency_keywords),
    lead_fields: splitList(input.lead_fields),
    version: 1,
    is_active: true,
  };

  if (input.instruction_id) payload.id = input.instruction_id;

  return payload;
}

export function getAgentSetupCompletion(input: Partial<AgentSetupInput>): AgentSetupCompletion {
  const checks = [
    { ok: Boolean(clean(input.name)), blocker: 'Agent name is required.' },
    { ok: Boolean(clean(input.template_key)), blocker: 'Template is required.' },
    { ok: Boolean(clean(input.system_prompt)), blocker: 'Core instructions are required.' },
    { ok: Boolean(clean(input.tone)), blocker: 'Tone is required.' },
    { ok: Boolean(clean(input.language)), blocker: 'Language is required.' },
    { ok: Boolean(clean(input.lead_qualification_instructions)), blocker: 'Lead qualification rules are required.' },
    { ok: Boolean(clean(input.handoff_rules)), blocker: 'Handoff rules are required.' },
  ];

  const completed = checks.filter((check) => check.ok).length;
  const blockers = checks.filter((check) => !check.ok).map((check) => check.blocker);

  return {
    completed,
    total: checks.length,
    percentComplete: Math.round((completed / checks.length) * 100),
    blockers,
    ready: blockers.length === 0 && Object.keys(validateAgentSetupInput(input)).length === 0,
  };
}

export function applyAgentTemplate(input: AgentSetupInput, templateKey: string): AgentSetupInput {
  const template = getAgentTemplate(templateKey);
  if (!template) return { ...input, template_key: templateKey };

  return {
    ...input,
    template_key: template.key,
    tone: input.tone || template.tone,
    system_prompt: input.system_prompt || template.systemPrompt,
    lead_qualification_instructions: input.lead_qualification_instructions || template.leadQualificationInstructions,
    handoff_rules: input.handoff_rules || template.handoffRules,
    never_say_rules: input.never_say_rules || template.neverSayRules,
    lead_fields: input.lead_fields || template.leadFields.join(', '),
    emergency_keywords: input.emergency_keywords || template.emergencyKeywords.join(', '),
  };
}
