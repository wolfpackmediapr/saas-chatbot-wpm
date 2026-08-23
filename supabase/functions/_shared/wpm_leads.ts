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

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Words that look like names to a regex but never are. */
const NOT_A_NAME = new Set([
  'i', 'im', 'hi', 'hey', 'hello', 'thanks', 'thank', 'you', 'the', 'and', 'my',
  'am', 'is', 'are', 'a', 'an', 'to', 'for', 'me', 'we', 'us', 'it', 'yes', 'no',
  'ok', 'okay', 'please', 'good', 'morning', 'afternoon', 'evening', 'everyday',
  'every', 'day', 'today', 'tomorrow', 'am/pm', 'best', 'time', 'email', 'name',
  // Words that show up where a name should be, especially once single-word
  // names are accepted. "Chatbot" on its own line above an email address is a
  // subject, not a person.
  'chatbot', 'chatbots', 'chat', 'bot', 'bots', 'marketing', 'branding', 'brand',
  'video', 'website', 'web', 'app', 'apps', 'automation', 'social', 'media',
  'content', 'seo', 'ads', 'design', 'development', 'agency', 'business',
  'company', 'info', 'information', 'service', 'services', 'price', 'pricing',
  'quote', 'booking', 'appointment', 'consultation', 'interested', 'interest',
  'number', 'phone', 'contact', 'call', 'meeting', 'discovery', 'sure', 'here',
  // The agent answers in Spanish too, and so do customers.
  'hola', 'buenas', 'buenos', 'gracias', 'saludos', 'si', 'claro', 'bueno',
  'nombre', 'correo', 'telefono', 'teléfono',
  // Acknowledgements that precede a details dump: "Cool jane@..." must not
  // yield a lead named "Cool".
  'cool', 'great', 'perfect', 'nice', 'awesome', 'yeah', 'yep', 'sure', 'sorry',
  'well', 'right', 'fine', 'done', 'got', 'send', 'sent', 'give', 'take',
]);

function bareWord(part: string): string {
  return part.replace(/[^\p{L}'\-]/gu, '').toLowerCase();
}

/**
 * Drop filler sitting either side of a name.
 *
 * People answer "Ok Williamson Smithweson" or "Thanks, Jane Rivera". Rejecting
 * the whole candidate because one edge word is a stopword threw away an
 * otherwise perfect match, and sent extraction to a fallback that picked the
 * agent's own text instead.
 */
function trimFiller(candidate: string): string[] {
  const parts = candidate.trim().split(/\s+/);
  let start = 0;
  let end = parts.length;
  while (start < end && NOT_A_NAME.has(bareWord(parts[start]))) start += 1;
  while (end > start && NOT_A_NAME.has(bareWord(parts[end - 1]))) end -= 1;
  return parts.slice(start, end);
}

/** Every word reads like part of a person's name. */
function partsAreNamely(parts: string[]): boolean {
  return parts.length > 0 && parts.every((part) => {
    const bare = bareWord(part);
    return bare.length >= 2 && !NOT_A_NAME.has(bare);
  });
}

function looksLikeName(candidate: string): boolean {
  const parts = trimFiller(candidate);
  if (parts.length < 2 || parts.length > 4) return false;
  return partsAreNamely(parts);
}

/**
 * A "here are my details" message, one value per line:
 *
 *     Wilfre
 *     8598147330
 *     goldenpinepplerecs@gmail.com
 *
 * The line that is neither an email, a phone number nor a link is the name.
 * This is the only reliable way to accept someone who gives just a first name,
 * which plenty of people do — elsewhere a lone capitalised word is far more
 * likely to be a subject ("Chatbot") than a person, so single words are only
 * trusted inside this shape.
 */
function nameFromDetailsBlock(text: string): string | null {
  const lines = text.split(/[\n\r]+/).map((line) => line.trim()).filter(Boolean);

  const looksLikeContact = (line: string) =>
    line.includes('@') || line.replace(/\D/g, '').length >= 7;

  // Only trust this shape when the message really is a list of details.
  const firstContact = lines.findIndex(looksLikeContact);
  if (firstContact < 0) return null;

  // Up to and INCLUDING the contact line, because messengers flatten line
  // breaks: "Ok Juan\njuachi@hotmail.com\n7777347330" arrives from Instagram as
  // one line, and stripping the contact tokens out of it leaves the name.
  // Never past that point — trailing commentary is not a name, which is how
  // "Hola / correo@… / reservation" produced a lead called "Reservation".
  for (const line of lines.slice(0, firstContact + 1)) {
    const remainder = line
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/[\w.+-]+@[\w.-]+\.\w+/g, ' ')       // email
      .replace(/(?:\+?\d[\d().\-\s]{6,}\d)/g, ' ')  // phone
      .replace(/[.,;:!?]+/g, ' ');

    const parts = trimFiller(remainder);
    if (parts.length < 1 || parts.length > 3) continue;
    if (!partsAreNamely(parts)) continue;
    // Letters, apostrophes and hyphens only — no stray punctuation or digits.
    if (!/^[\p{L}][\p{L}'\-]*(?:\s+[\p{L}][\p{L}'\-]*)*$/u.test(parts.join(' '))) continue;

    return titleCase(parts.join(' '));
  }

  return null;
}

/** The trimmed form of a candidate that `looksLikeName` accepted. */
function nameFrom(candidate: string): string {
  return trimFiller(candidate).join(' ');
}

/**
 * Markdown links are the agent's, never the customer's.
 *
 * The agent offers "[Discovery Call](https://calendly.com/...)", and a bare
 * scan reads "Discovery Call" as two capitalised words — which is exactly how
 * a real lead was stored under that name twice.
 */
function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]*)\]\([^)]*\)/g, ' ');
}

/**
 * Pull a person's name out of a message.
 *
 * The introduction forms ("my name is …") are tried first. They miss the most
 * common case by far, though: the agent asks for name, email and a good time,
 * and the customer answers with the bare values —
 * "Wilfredo Carrasquillo someone@example.com 9am everyday". That reply used to
 * yield an email and a lead named "Unknown", so a second pass looks for
 * capitalised words sitting next to an email address.
 */
function extractName(text: string): string | null {
  const introduced = text.match(
    /(?:my name is|name is|i am|i'm)\s+([a-z][a-z'\-]+(?:\s+[a-z][a-z'\-]+){0,3})/i,
  );
  // "I'm interested in a chat bot" matches this pattern just as well as
  // "I'm Wilfre" does, and used to be stored as a lead named "Interested In".
  // The introduction form is a strong signal, not a guarantee.
  // Take words only until the first one that is not namely, rather than
  // trimming the edges: a name follows "I'm" immediately, so "I'm interested
  // in a chat" must yield nothing rather than salvaging "In" from the middle.
  if (introduced) {
    const parts: string[] = [];
    for (const part of introduced[1].trim().split(/\s+/)) {
      const bare = bareWord(part);
      if (bare.length < 2 || NOT_A_NAME.has(bare)) break;
      parts.push(part);
    }
    if (parts.length >= 1 && parts.length <= 4) return titleCase(parts.join(' '));
  }

  // A details block is more reliable than any regex over prose, and it is the
  // only place a single-word name can be trusted.
  const fromBlock = nameFromDetailsBlock(text);
  if (fromBlock) return fromBlock;

  // Bare answer: capitalised words immediately before or after an email.
  // The lookahead stops the greedy capture from swallowing the start of the
  // email itself: "Smithweson\nMindsethubpr@gmail.com" otherwise yields the
  // name "Williamson Smithweson Mindsethubp", with the stray "r@" left to match
  // the address.
  const beside = text.match(
    /([A-Z][\p{L}'\-]+(?:\s+[A-Z][\p{L}'\-]+){1,3})(?![\w.+-]*@)\s*[,;]?\s*[\w.+-]+@[\w.-]+\.\w+/u,
  ) ?? text.match(
    /[\w.+-]+@[\w.-]+\.\w+\s*[,;]?\s*([A-Z][\p{L}'\-]+(?:\s+[A-Z][\p{L}'\-]+){1,3})/u,
  );
  if (beside && looksLikeName(beside[1])) return titleCase(nameFrom(beside[1]));

  // Otherwise the first run of capitalised words that reads like a full name.
  for (const candidate of text.match(/[A-Z][\p{L}'\-]+(?:\s+[A-Z][\p{L}'\-]+){1,3}/gu) ?? []) {
    if (looksLikeName(candidate)) return titleCase(nameFrom(candidate));
  }

  return null;
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
  // Who the lead IS can only come from what the customer wrote. Scanning our
  // own reply for their identity is how a lead was stored as "Discovery Call":
  // the agent offers a Calendly link, and the name fallback picked the markdown
  // label out of the agent's own words. Twice, on real leads.
  //
  // What the lead WANTS is different — the agent legitimately confirms the
  // service and the timing, so context still reads both sides.
  const identityText = stripMarkdownLinks(args.inboundText);
  const combinedText = `${args.inboundText}\n${args.assistantText ?? ''}`;
  const email = clean(identityText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]);
  const phone = clean(identityText.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/)?.[0]);
  const fullName = extractName(identityText);
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
