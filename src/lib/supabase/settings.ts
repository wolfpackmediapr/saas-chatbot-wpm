import { supabase } from './client';

export interface UserSettings {
  user_id: string;
  company_logo: string | null;
  response_style: 'professional' | 'casual' | 'friendly';
  response_length: 'concise' | 'balanced' | 'detailed';
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
