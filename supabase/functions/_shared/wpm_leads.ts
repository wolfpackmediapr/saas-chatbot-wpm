interface SupabaseLike {
  from(table: string): any;
}

export interface ExtractedLead {
  isQualified: boolean;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  serviceInterest: string | null;
  intent: string | null;
  qualificationData: Record<string, unknown>;
  sourceChannel: string | null;
}

export interface LeadIntegration {
  id: string;
  provider: string;
  integration_type: 'zapier_webhook' | 'custom_webhook' | 'crm' | 'calendar' | 'email' | 'slack';
  name: string;
  field_map: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function extractName(text: string): string | null {
  const match = text.match(/(?:my name is|name is|i am|i'm)\s+([a-z][a-z'\-]+(?:\s+[a-z][a-z'\-]+){0,3})/i);
  if (!match) return null;
  return match[1]
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function extractServiceInterest(text: string): string | null {
  const lowered = text.toLowerCase();
  const services = [
    'private dining',
    'catering',
    'appointment',
    'reservation',
    'consultation',
    'booking',
    'event',
    'dinner',
    'brunch',
  ];

  return services.find((service) => lowered.includes(service)) ?? null;
}

function extractIntent(text: string, serviceInterest: string | null, qualificationData: Record<string, unknown>): string | null {
  const lowered = text.toLowerCase();
  if (/\b(book|booking|reserve|reservation|appointment|available|availability|schedule)\b/.test(lowered)) {
    return 'booking_request';
  }
  if (serviceInterest && (qualificationData.party_size || qualificationData.requested_date)) {
    return 'booking_request';
  }
  if (/\b(price|pricing|cost|quote|estimate|package)\b/.test(lowered)) {
    return 'pricing_request';
  }
  if (serviceInterest) return 'service_inquiry';
  return null;
}

function extractQualificationData(text: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const partySize = text.match(/(?:for|party of|group of)\s+(\d{1,4})\s*(?:people|persons|guests|pax)?/i)
    ?? text.match(/(\d{1,4})\s*(?:people|persons|guests|pax)/i);
  const requestedDate = text.match(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);

  if (partySize) data.party_size = Number(partySize[1]);
  if (requestedDate) {
    data.requested_date = requestedDate[1].charAt(0).toUpperCase() + requestedDate[1].slice(1).toLowerCase();
  }

  return data;
}

export function extractLeadFromConversationText(args: {
  inboundText: string;
  assistantText?: string;
  sourceChannel: string | null;
}): ExtractedLead {
  const combinedText = `${args.inboundText}\n${args.assistantText ?? ''}`;
  const email = clean(combinedText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]);
  const phone = clean(combinedText.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/)?.[0]);
  const fullName = extractName(combinedText);
  const serviceInterest = extractServiceInterest(combinedText);
  const qualificationData = extractQualificationData(combinedText);
  const intent = extractIntent(combinedText, serviceInterest, qualificationData);
  const hasContact = Boolean(email || phone);
  const hasCommercialIntent = Boolean(serviceInterest || intent);

  return {
    isQualified: hasContact && hasCommercialIntent,
    fullName,
    email,
    phone,
    serviceInterest,
    intent,
    qualificationData,
    sourceChannel: args.sourceChannel,
  };
}

export function buildLeadUpsertPayload(args: {
  clientId: string;
  conversationId: string;
  lead: ExtractedLead;
  nowIso?: string;
}) {
  return {
    client_id: args.clientId,
    conversation_id: args.conversationId,
    full_name: args.lead.fullName,
    email: args.lead.email,
    phone: args.lead.phone,
    service_interest: args.lead.serviceInterest,
    intent: args.lead.intent,
    qualification_data: args.lead.qualificationData,
    source_channel: args.lead.sourceChannel,
    status: args.lead.isQualified ? 'qualified' : 'new',
    last_contact_at: args.nowIso ?? new Date().toISOString(),
  };
}

function toolNameForIntegration(integration: LeadIntegration): string {
  if (integration.integration_type === 'zapier_webhook' || integration.provider.toLowerCase() === 'zapier') {
    return 'zapier.qualified_lead';
  }
  if (integration.integration_type === 'custom_webhook') return 'webhook.qualified_lead';
  return `${integration.provider}.qualified_lead`;
}

export function buildToolExecutionPayload(args: {
  clientId: string;
  conversationId: string;
  integration: LeadIntegration;
  leadId: string;
  lead: ExtractedLead;
}) {
  return {
    client_id: args.clientId,
    conversation_id: args.conversationId,
    integration_id: args.integration.id,
    tool_name: toolNameForIntegration(args.integration),
    input_payload: {
      lead_id: args.leadId,
      integration_name: args.integration.name,
      provider: args.integration.provider,
      integration_type: args.integration.integration_type,
      field_map: args.integration.field_map,
      lead: args.lead,
    },
    status: 'pending',
  };
}

function shouldQueueForQualifiedLead(integration: LeadIntegration): boolean {
  const trigger = integration.metadata?.trigger;
  return trigger === undefined || trigger === null || trigger === 'qualified_lead';
}

export async function persistQualifiedLeadAndQueueActions(args: {
  supabase: SupabaseLike;
  clientId: string;
  conversationId: string;
  lead: ExtractedLead;
  nowIso?: string;
}): Promise<
  | { ok: true; leadId: string | null; queuedToolExecutionIds: string[]; skipped: boolean; error: null }
  | { ok: false; leadId: null; queuedToolExecutionIds: string[]; skipped: false; error: string }
> {
  if (!args.lead.isQualified) {
    return {
      ok: true,
      leadId: null,
      queuedToolExecutionIds: [],
      skipped: true,
      error: null,
    };
  }

  const { data: lead, error: leadError } = await args.supabase
    .from('wpm_leads')
    .insert(buildLeadUpsertPayload(args))
    .select('id')
    .single();

  if (leadError || !lead) {
    return {
      ok: false,
      leadId: null,
      queuedToolExecutionIds: [],
      skipped: false,
      error: leadError?.message ?? 'Lead upsert returned no row',
    };
  }

  const leadId = (lead as { id: string }).id;
  const { data: integrationsData, error: integrationsError } = await args.supabase
    .from('wpm_integrations')
    .select('id, provider, integration_type, name, field_map, metadata')
    .eq('client_id', args.clientId)
    .eq('is_active', true)
    .in('integration_type', ['zapier_webhook', 'custom_webhook', 'crm']);

  if (integrationsError) {
    return {
      ok: false,
      leadId: null,
      queuedToolExecutionIds: [],
      skipped: false,
      error: integrationsError.message,
    };
  }

  const integrations = ((integrationsData ?? []) as LeadIntegration[]).filter(shouldQueueForQualifiedLead);
  const queuedToolExecutionIds: string[] = [];

  for (const integration of integrations) {
    const { data: toolExecution, error: toolError } = await args.supabase
      .from('wpm_tool_executions')
      .insert(buildToolExecutionPayload({
        clientId: args.clientId,
        conversationId: args.conversationId,
        integration,
        leadId,
        lead: args.lead,
      }))
      .select('id')
      .single();

    if (toolError || !toolExecution) {
      return {
        ok: false,
        leadId: null,
        queuedToolExecutionIds,
        skipped: false,
        error: toolError?.message ?? 'Tool execution insert returned no row',
      };
    }

    queuedToolExecutionIds.push((toolExecution as { id: string }).id);
  }

  return {
    ok: true,
    leadId,
    queuedToolExecutionIds,
    skipped: false,
    error: null,
  };
}
