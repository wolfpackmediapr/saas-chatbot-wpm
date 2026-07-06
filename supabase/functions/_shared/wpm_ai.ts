import { buildWpmAssistantMessages, type WpmBotContext, type WpmChatMessage } from './wpm_prompt.ts';

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
}

function firstOrValue<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toChatRole(role: MessageRow['role']): 'user' | 'assistant' | null {
  if (role === 'user') return 'user';
  if (role === 'assistant') return 'assistant';
  return null;
}

export async function loadWpmBotContext(
  supabase: SupabaseLike,
  conversationId: string,
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

  const { data: knowledgeData, error: knowledgeError } = await supabase
    .from('wpm_knowledge_sources')
    .select('title, content_text')
    .eq('client_id', conversation.client_id)
    .eq('status', 'ready')
    .order('updated_at', { ascending: false })
    .limit(8);

  if (knowledgeError) return { ok: false, error: knowledgeError.message };

  const { data: messagesData, error: messagesError } = await supabase
    .from('wpm_messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: false })
    .limit(12);

  if (messagesError) return { ok: false, error: messagesError.message };

  const recentMessages = ((messagesData ?? []) as MessageRow[])
    .slice()
    .reverse()
    .map((message): WpmChatMessage | null => {
      const role = toChatRole(message.role);
      if (!role || !message.content?.trim()) return null;
      return { role, content: message.content };
    })
    .filter((message): message is WpmChatMessage => message !== null);

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
}): Promise<
  | { ok: true; content: string; messageId: string; modelProvider: string; modelName: string; tokenUsage: unknown }
  | { ok: false; error: string }
> {
  const loaded = await loadWpmBotContext(args.supabase, args.conversationId);
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

  const content = completion.content.trim();
  if (!content) return { ok: false, error: 'OpenAI returned an empty assistant response' };

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
    messageId: (message as { id: string }).id,
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
