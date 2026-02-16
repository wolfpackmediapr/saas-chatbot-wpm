import { supabase } from './client';
import { getUserSettings } from './settings';

export interface AIBot {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  assistant_id: string | null;
  api_key: string | null;
  is_active: boolean;
  color: string;
  icon: string;
  created_at: string;
  updated_at: string;
}

export async function getBots() {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('ai_bots')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data as AIBot[];
}

export async function getActiveBot() {
  if (!supabase) throw new Error('Supabase not configured');

  let { data, error } = await supabase
    .from('ai_bots')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;

  // If no active bot found, automatically activate the first available bot
  if (!data) {
    const { data: allBots, error: botsError } = await supabase
      .from('ai_bots')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1);

    if (botsError) throw botsError;

    if (allBots && allBots.length > 0) {
      // Activate the first bot
      const firstBot = allBots[0];
      const { data: activatedBot, error: updateError } = await supabase
        .from('ai_bots')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', firstBot.id)
        .select()
        .single();

      if (updateError) throw updateError;
      return activatedBot as AIBot;
    }
  }

  return data as AIBot | null;
}

export async function getBotById(botId: string) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('ai_bots')
    .select('*')
    .eq('id', botId)
    .maybeSingle();

  if (error) throw error;
  return data as AIBot | null;
}

export async function createBot(bot: {
  name: string;
  description?: string;
  assistant_id?: string | null;
  api_key?: string | null;
  is_active?: boolean;
  color?: string;
  icon?: string;
}) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('ai_bots')
    .insert({
      user_id: session.session.user.id,
      name: bot.name,
      description: bot.description || null,
      assistant_id: bot.assistant_id || null,
      api_key: bot.api_key || null,
      is_active: bot.is_active ?? false,
      color: bot.color || 'cyan',
      icon: bot.icon || 'Bot',
    })
    .select()
    .single();

  if (error) throw error;
  return data as AIBot;
}

export async function updateBot(botId: string, updates: Partial<AIBot>) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('ai_bots')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', botId)
    .select()
    .single();

  if (error) throw error;
  return data as AIBot;
}

export async function deleteBot(botId: string) {
  if (!supabase) throw new Error('Supabase not configured');

  // Check if this is the active bot
  const { data: botToDelete } = await supabase
    .from('ai_bots')
    .select('is_active')
    .eq('id', botId)
    .single();

  const { error } = await supabase
    .from('ai_bots')
    .delete()
    .eq('id', botId);

  if (error) throw error;

  // If we deleted the active bot, activate another one
  if (botToDelete?.is_active) {
    const { data: remainingBots } = await supabase
      .from('ai_bots')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1);

    if (remainingBots && remainingBots.length > 0) {
      await supabase
        .from('ai_bots')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', remainingBots[0].id);
    }
  }
}

export async function setActiveBot(botId: string) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('ai_bots')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', botId)
    .select()
    .single();

  if (error) throw error;
  return data as AIBot;
}

export async function createDefaultBot() {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase.rpc('create_default_bot_for_user', {
    p_user_id: session.session.user.id,
  });

  if (error) throw error;
  return data;
}

export async function getBotAssistantId(botAssistantId?: string | null): Promise<string | null> {
  // If bot has its own assistant ID, use it
  if (botAssistantId) {
    return botAssistantId;
  }

  // Fall back to global assistant ID from user settings
  try {
    const settings = await getUserSettings();
    return settings?.openai_assistant_id || null;
  } catch (error) {
    console.error('Failed to get user settings for assistant ID:', error);
    return null;
  }
}

export const BOT_COLORS = [
  { value: 'cyan', label: 'Cyan', class: 'bg-cyan-500' },
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'green', label: 'Green', class: 'bg-green-500' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { value: 'pink', label: 'Pink', class: 'bg-pink-500' },
  { value: 'red', label: 'Red', class: 'bg-red-500' },
  { value: 'yellow', label: 'Yellow', class: 'bg-yellow-500' },
  { value: 'teal', label: 'Teal', class: 'bg-teal-500' },
];

export const BOT_ICONS = [
  'Bot',
  'MessageSquare',
  'Sparkles',
  'Zap',
  'Star',
  'Heart',
  'Smile',
  'Briefcase',
];
