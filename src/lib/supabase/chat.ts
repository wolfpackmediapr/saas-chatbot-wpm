import { supabase } from './client';

export interface ChatThread {
  id: string;
  user_id: string;
  title: string;
  openai_thread_id: string | null;
  bot_id: string | null;
  bot_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  content: string;
  is_user: boolean;
  images?: string[];
  created_at: string;
}

export async function createChatThread(
  openaiThreadId: string,
  title: string = 'New Conversation',
  botId?: string,
  botName?: string
) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('chat_threads')
    .insert({
      user_id: user.id,
      openai_thread_id: openaiThreadId,
      title,
      bot_id: botId || null,
      bot_name: botName || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ChatThread;
}

export async function getChatThreads() {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('chat_threads')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data as ChatThread[];
}

export async function getChatThread(threadId: string) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('chat_threads')
    .select('*')
    .eq('id', threadId)
    .maybeSingle();

  if (error) throw error;
  return data as ChatThread | null;
}

export async function getChatThreadByOpenAIId(openaiThreadId: string) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('chat_threads')
    .select('*')
    .eq('openai_thread_id', openaiThreadId)
    .maybeSingle();

  if (error) throw error;
  return data as ChatThread | null;
}

export async function updateChatThread(threadId: string, updates: Partial<ChatThread>) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('chat_threads')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', threadId)
    .select()
    .single();

  if (error) throw error;
  return data as ChatThread;
}

export async function deleteChatThread(threadId: string) {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase
    .from('chat_threads')
    .delete()
    .eq('id', threadId);

  if (error) throw error;
}

export async function getChatMessages(threadId: string) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data as ChatMessage[];
}

export async function createChatMessage(
  threadId: string,
  content: string,
  isUser: boolean,
  images?: string[]
) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      thread_id: threadId,
      content,
      is_user: isUser,
      images: images || [],
    })
    .select()
    .single();

  if (error) throw error;

  await supabase
    .from('chat_threads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', threadId);

  return data as ChatMessage;
}

export async function getChatThreadsByBot(botId: string) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('chat_threads')
    .select('*')
    .eq('bot_id', botId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data as ChatThread[];
}

export async function deleteAllChatThreads() {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase
    .from('chat_threads')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) throw error;
}
