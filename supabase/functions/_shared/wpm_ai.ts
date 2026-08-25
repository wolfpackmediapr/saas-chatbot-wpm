import { buildWpmAssistantMessages, flattenMarkdownLinks, HUMAN_REPLY_PREFIX, stripHumanReplyMarker, type WpmBotContext, type WpmChatMessage } from './wpm_prompt.ts';
import { matchEmergencyKeyword, stripHandoffSignal } from './wpm_handoff.ts';

interface SupabaseLike {
  from(table: string): any;
}

export type WpmChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface WpmMultimodalChatMessage {
  role: WpmChatMessage['role'];
  content: string | WpmChatContentPart[];
}

export interface OpenAIChatRequest {
  model: string;
  messages: WpmMultimodalChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface OpenAIChatResponse {
  id: string | null;
  content: string;
  tokenUsage: unknown;
  raw: unknown;
}

export interface OpenAIChatClient {
  createChatCompletion(request: OpenAIChatRequest): Promise<OpenAIChatResponse>;
}

interface ConversationContextRow {
  id: string;
  client_id: string;
  bot_profile_id: string | null;
  wpm_clients: WpmBotContext['client'] | WpmBotContext['client'][] | null;
  wpm_bot_profiles: WpmBotContext['botProfile'] | WpmBotContext['botProfile'][] | null;
}

interface InstructionRow {
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
}

interface KnowledgeRow {
  title: string;
  content_text: string | null;
}

interface MessageRow {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'human';
  content: string;
  created_at?: string;
  provider_message_id?: string | null;
}

function firstOrValue<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * How many rows to read from the database. Deliberately larger than
 * WPM_CONTEXT_WINDOW: `system`/`tool` rows are dropped after the fetch, so
 * fetching exactly the window size meant any non-conversational row silently
 * shrank what the model saw. Fetch wide, then trim to the window.
 */
const WPM_CONTEXT_FETCH_ROWS = 24;

/** Turns of real conversation the model is given. The cap itself is unchanged. */
const WPM_CONTEXT_WINDOW = 12;

/**
 * To the customer a teammate and the bot are the same voice, so a human turn
 * has to become an `assistant` turn — otherwise the transcript reads as if
 * nobody answered. It carries HUMAN_REPLY_PREFIX so the model knows a
 * colleague already spoke and does not contradict or repeat them, which is
 * exactly what happens when `decideHandoffAction` hands the bot back in.
 */
function toChatMessage(message: MessageRow): WpmChatMessage | null {
  if (!message.content?.trim()) return null;
  if (message.role === 'user') return { role: 'user', content: message.content };
  if (message.role === 'assistant') return { role: 'assistant', content: message.content };
  if (message.role === 'human') {
    return { role: 'assistant', content: `${HUMAN_REPLY_PREFIX} ${message.content}` };
  }
  return null;
}

export async function loadWpmBotContext(
  supabase: SupabaseLike,
  conversationId: string,
  options?: {
    /**
     * `provider_message_id` of the inbound message this reply is being
     * generated for. The webhook stores that message *before* generating, so
     * without this the same text is handed to the model twice — once as the
     * tail of the history and again as the appended inbound turn.
     */
    excludeProviderMessageId?: string | null;
  },
): Promise<
  | { ok: true; context: WpmBotContext; recentMessages: WpmChatMessage[]; conversation: { id: string; client_id: string; bot_profile_id: string } }
  | { ok: false; error: string }
> {
  const { data: conversationData, error: conversationError } = await supabase
    .from('wpm_conversations')
    .select(`
      id,
      client_id,
      bot_profile_id,
      wpm_clients(id, name, description, services, location, industry, timezone, website_url, contact_email, contact_phone),
      wpm_bot_profiles(id, public_name, tone, language, response_length, booking_url, handoff_contact, model_provider, model_name)
    `)
    .eq('id', conversationId)
    .maybeSingle();

  if (conversationError) return { ok: false, error: conversationError.message };
  if (!conversationData) return { ok: false, error: 'Conversation not found' };

  const conversation = conversationData as ConversationContextRow;
  const client = firstOrValue(conversation.wpm_clients);
  const botProfile = firstOrValue(conversation.wpm_bot_profiles);

  if (!client) return { ok: false, error: 'Conversation is missing client context' };
  if (!botProfile || !conversation.bot_profile_id) return { ok: false, error: 'Conversation is missing active bot profile context' };

  const { data: instructionsData, error: instructionsError } = await supabase
    .from('wpm_bot_instructions')
    .select('system_prompt, business_summary, faq_instructions, lead_qualification_instructions, handoff_rules, never_say_rules, primary_goal, response_language, emergency_keywords, lead_fields')
    .eq('bot_profile_id', conversation.bot_profile_id)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (instructionsError) return { ok: false, error: instructionsError.message };

  // Knowledge is scoped to the agent answering, not just the account. It used
  // to be client-wide, so every agent on an account saw every other agent's
  // documents — one account reselling to two different businesses would put
  // one client's material into the other's prompt.
  //
  // An UNASSIGNED source (bot_profile_id NULL) stays shared with every agent
  // on the account: that is the account-wide tier (a refund policy, opening
  // hours) and it is what every existing row already is, so this changes
  // nothing until a source is deliberately assigned.
  const knowledgeScope = buildKnowledgeScopeFilter(conversation.bot_profile_id);

  const { data: knowledgeData, error: knowledgeError } = await supabase
    .from('wpm_knowledge_sources')
    .select('title, content_text')
    .eq('client_id', conversation.client_id)
    .eq('status', 'ready')
    .or(knowledgeScope)
    .order('updated_at', { ascending: false })
    .limit(8);

  if (knowledgeError) return { ok: false, error: knowledgeError.message };

  const { data: messagesData, error: messagesError } = await supabase
    .from('wpm_messages')
    .select('role, content, created_at, provider_message_id')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: false })
    .limit(WPM_CONTEXT_FETCH_ROWS);

  if (messagesError) return { ok: false, error: messagesError.message };

  const orderedRows = ((messagesData ?? []) as MessageRow[]).slice().reverse();

  // Drop the stored copy of the message we are replying to, so it is not sent
  // once here and again as the appended inbound turn. Matched on
  // `provider_message_id`, never on text: a customer who genuinely sends the
  // same word twice in a row must keep both turns. Only the newest row is
  // eligible, so nothing deeper in the history can be removed.
  const excludeId = options?.excludeProviderMessageId;
  if (excludeId) {
    const newest = orderedRows[orderedRows.length - 1];
    if (newest && newest.provider_message_id === excludeId) orderedRows.pop();
  }

  const recentMessages = orderedRows
    .map(toChatMessage)
    .filter((message): message is WpmChatMessage => message !== null)
    .slice(-WPM_CONTEXT_WINDOW);

  return {
    ok: true,
    context: {
      client,
      botProfile,
      instructions: instructionsData as InstructionRow | null,
      knowledge: (knowledgeData ?? []) as KnowledgeRow[],
    },
    recentMessages,
    conversation: {
      id: conversation.id,
      client_id: conversation.client_id,
      bot_profile_id: conversation.bot_profile_id,
    },
  };
}

/**
 * PostgREST `.or()` filter restricting knowledge to the agent that is answering.
 *
 * Knowledge used to be scoped to the ACCOUNT, so every agent saw every other
 * agent's documents — an account reselling to two businesses put one client's
 * material into the other's prompt.
 *
 * An UNASSIGNED source (`bot_profile_id` NULL) stays shared with every agent:
 * that is the account-wide tier, and it is what every pre-existing row already
 * is, so this is a no-op until a source is deliberately assigned.
 *
 * With no agent resolved, only account-wide sources are visible — never
 * another agent's.
 */
export function buildKnowledgeScopeFilter(botProfileId: string | null | undefined): string {
  const shared = 'bot_profile_id.is.null';
  return botProfileId ? `${shared},bot_profile_id.eq.${botProfileId}` : shared;
}

export function buildOutboundAssistantMessageInsertPayload(args: {
  conversationId: string;
  clientId: string;
  content: string;
  modelProvider: string;
  modelName: string;
  tokenUsage: unknown;
  rawResponse: unknown;
}) {
  const raw = args.rawResponse as { id?: string | null } | null;

  return {
    conversation_id: args.conversationId,
    client_id: args.clientId,
    direction: 'outbound',
    role: 'assistant',
    content: args.content,
    attachments: [],
    model_provider: args.modelProvider,
    model_name: args.modelName,
    token_usage: args.tokenUsage,
    metadata: {
      provider_response_id: raw?.id ?? null,
      generated_by: 'wpm_ai',
    },
  };
}

export async function generateAndStoreAssistantReply(args: {
  supabase: SupabaseLike;
  openAI: OpenAIChatClient;
  conversationId: string;
  inboundMessage: string;
  /** Public image URLs attached to the inbound message (sent to vision-capable models). */
  imageUrls?: string[];
  /**
   * `provider_message_id` of the inbound message, when the caller has already
   * stored it. Lets the loader drop that stored copy so the model receives the
   * message once, not twice. Omit it and the previous behaviour is unchanged.
   */
  inboundProviderMessageId?: string | null;
}): Promise<
  | {
      ok: true;
      content: string;
      /** Escalation fired — via emergency keyword or the AI's own signal. */
      handoffRequested: boolean;
      /** Why it fired, for the handoff event log. Null when no handoff. */
      handoffReason: string | null;
      messageId: string;
      /**
       * The metadata written onto the stored row, so a caller recording the
       * send outcome merges into it instead of overwriting it — `generated_by`
       * is queried elsewhere and has to survive that update.
       */
      metadata: Record<string, unknown>;
      modelProvider: string;
      modelName: string;
      tokenUsage: unknown;
    }
  | { ok: false; error: string }
> {
  const loaded = await loadWpmBotContext(args.supabase, args.conversationId, {
    excludeProviderMessageId: args.inboundProviderMessageId,
  });
  if (!loaded.ok) return loaded;

  const modelProvider = loaded.context.botProfile.model_provider;
  const modelName = loaded.context.botProfile.model_name;

  if (modelProvider !== 'openai') {
    return { ok: false, error: `Unsupported model provider: ${modelProvider}` };
  }

  const maxTokens =
    loaded.context.botProfile.response_length === 'concise'
      ? 280
      : loaded.context.botProfile.response_length === 'detailed'
      ? 900
      : 600;

  const messages: WpmMultimodalChatMessage[] = buildWpmAssistantMessages(
    loaded.context,
    loaded.recentMessages,
    args.inboundMessage,
  );

  // Attach inbound images to the final user message so vision-capable models
  // can react to their content (max 4 to bound cost).
  const imageUrls = (args.imageUrls ?? []).filter(Boolean).slice(0, 4);
  if (imageUrls.length > 0) {
    const last = messages[messages.length - 1];
    const baseText = typeof last.content === 'string' ? last.content : args.inboundMessage;
    // Explicit instruction is required: earlier turns in the history may
    // contain "I can't view images" replies from before vision support, and
    // small models will parrot that pattern unless told the image is visible.
    last.content = [
      {
        type: 'text',
        text: `${baseText}\n\n(The customer's image is attached to this message and you CAN see it. Look at its content and respond helpfully in the context of this business. Never say you cannot view images.)`,
      },
      ...imageUrls.map((url): WpmChatContentPart => ({ type: 'image_url', image_url: { url } })),
    ];
  }

  let completion: OpenAIChatResponse;
  try {
    completion = await args.openAI.createChatCompletion({
      model: modelName,
      messages,
      temperature: 0.4,
      max_tokens: maxTokens,
    });
  } catch (err) {
    // If the vision request fails (expired CDN URL, non-vision model, ...),
    // retry once as text-only rather than leaving the customer unanswered.
    if (imageUrls.length === 0) throw err;
    console.warn('[wpm_ai] Vision completion failed, retrying text-only:', err);
    completion = await args.openAI.createChatCompletion({
      model: modelName,
      messages: buildWpmAssistantMessages(loaded.context, loaded.recentMessages, args.inboundMessage),
      temperature: 0.4,
      max_tokens: maxTokens,
    });
  }

  // Strip the handoff sentinel before the reply is stored or sent — it is an
  // internal signal, never customer-facing.
  const { content: unstripped, requested: sentinelRequested } = stripHandoffSignal(completion.content.trim());
  // Belt and braces: rule 10 forbids the model writing the teammate marker,
  // but it must never reach a customer if the model does it anyway.
  // Rule 12 likewise asks for plain text; this guarantees it, because these
  // channels show markdown syntax to the customer verbatim.
  const content = flattenMarkdownLinks(stripHumanReplyMarker(unstripped));
  if (!content) return { ok: false, error: 'OpenAI returned an empty assistant response' };

  // Deterministic escalation runs regardless of what the model decided: an
  // emergency keyword must never depend on the model following instructions.
  const keywordHit = matchEmergencyKeyword(
    args.inboundMessage,
    loaded.context.instructions?.emergency_keywords,
  );
  const handoffRequested = sentinelRequested || keywordHit !== null;
  const handoffReason = keywordHit
    ? `Emergency keyword: "${keywordHit}"`
    : sentinelRequested
      ? 'AI escalated per the escalation policy'
      : null;

  const outboundPayload = buildOutboundAssistantMessageInsertPayload({
    conversationId: loaded.conversation.id,
    clientId: loaded.conversation.client_id,
    content,
    modelProvider,
    modelName,
    tokenUsage: completion.tokenUsage,
    rawResponse: completion.raw,
  });

  const { data: message, error: messageError } = await args.supabase
    .from('wpm_messages')
    .insert(outboundPayload)
    .select('id')
    .single();

  if (messageError || !message) {
    return { ok: false, error: messageError?.message ?? 'Outbound message insert returned no row' };
  }

  return {
    ok: true,
    content,
    handoffRequested,
    handoffReason,
    messageId: (message as { id: string }).id,
    // Handed back so a caller recording the send outcome can merge into this
    // rather than overwrite it — `generated_by` is queried elsewhere and must
    // survive the delivery update.
    metadata: outboundPayload.metadata,
    modelProvider,
    modelName,
    tokenUsage: completion.tokenUsage,
  };
}

export function createOpenAIChatClient(apiKey: string): OpenAIChatClient {
  return {
    async createChatCompletion(request: OpenAIChatRequest): Promise<OpenAIChatResponse> {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.max_tokens,
        }),
      });

      const raw = await response.json();

      if (!response.ok) {
        const message = raw?.error?.message ?? `OpenAI request failed with HTTP ${response.status}`;
        throw new Error(message);
      }

      return {
        id: raw.id ?? null,
        content: raw.choices?.[0]?.message?.content ?? '',
        tokenUsage: raw.usage ?? null,
        raw,
      };
    },
  };
}
