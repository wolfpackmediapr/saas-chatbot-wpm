import { supabase } from './client';

export interface UserSettings {
  user_id: string;
  company_logo: string | null;
  /**
   * Legacy assistant-path fields. The browser no longer reads openai_api_key —
   * the legacy Chat proxies through the openai-chat edge function — and neither
   * is editable in Settings any more. openai_assistant_id is still read as a
   * fallback by bots.ts.
   */
  openai_api_key: string | null;
  openai_assistant_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function getUserSettings() {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return data as UserSettings | null;
}

export async function updateUserSettings(updates: Partial<UserSettings>) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: session.session.user.id,
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data as UserSettings;
}

export async function getCompanyLogo() {
  const settings = await getUserSettings();
  return settings?.company_logo || null;
}

export async function updateCompanyLogo(logo: string | null) {
  return updateUserSettings({ company_logo: logo });
}

export async function updateOpenAIConfig(updates: {
  openai_api_key?: string | null;
  openai_assistant_id?: string | null;
}) {
  return updateUserSettings(updates);
}

export async function getProfile() {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .eq('id', session.session.user.id)
    .maybeSingle();

  if (error) throw error;
  return data as { id: string; name: string; avatar_url: string | null } | null;
}

export async function updateProfileName(name: string) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', session.session.user.id)
    .select('id, name, avatar_url')
    .single();

  if (error) throw error;
  return data as { id: string; name: string; avatar_url: string | null };
}
