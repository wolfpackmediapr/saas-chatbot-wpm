import { supabase } from './client';

export interface WpmClientRecord {
  id: string;
  name: string;
  description?: string | null;
  timezone?: string | null;
  status?: string | null;
  website_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  industry?: string | null;
  notes?: string | null;
}

export interface WpmBotProfileRecord {
  id: string;
  client_id: string;
  name: string;
  public_name?: string | null;
  template_key?: string | null;
  tone?: string | null;
  response_length?: string | null;
  settings?: Record<string, any>;
  is_active: boolean;
}

export interface WpmBotInstructionsRecord {
  id: string;
  bot_profile_id: string;
  system_prompt: string;
  business_summary?: string | null;
  faq_instructions?: string | null;
  lead_qualification_instructions?: string | null;
  handoff_rules?: string | null;
  never_say_rules?: string | null;
  emergency_keywords?: string[];
  lead_fields?: any[];
  version: number;
  is_active: boolean;
}

export interface KnowledgeSource {
  id: string;
  client_id: string;
  bot_profile_id?: string | null;
  source_type: 'manual' | 'file' | 'url' | 'faq' | 'notion' | 'google_doc';
  title: string;
  source_url?: string | null;
  content_text?: string | null;
  status: 'draft' | 'processing' | 'ready' | 'failed' | 'archived';
  metadata?: Record<string, any>;
}

/**
 * Returns the current authenticated user's owned WPM client profile.
 * 
 * Falls back to a local demo client when:
 * - Supabase is not configured (common in previews / bolt.new)
 * - No auth session
 * - The wpm_clients table/row doesn't exist yet
 */
export async function getOwnedWpmClient(): Promise<WpmClientRecord | null> {
  if (!supabase) {
    // Graceful dev/preview fallback
    return {
      id: 'demo-client-001',
      name: 'Demo Business',
      description: 'Local development / bolt.new preview client',
    };
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return null;
    }

    // Correct column is owner_user_id per schema
    const { data, error } = await (supabase as any)
      .from('wpm_clients')
      .select('id, name, description, timezone, status, website_url, contact_email, contact_phone, industry, notes')
      .eq('owner_user_id', user.id)
      .maybeSingle();

    if (error || !data) {
      // Fallback so the app doesn't crash during early setup
      return {
        id: user.id,
        name: 'Your Business',
      };
    }

    return data as WpmClientRecord;
  } catch (err) {
    console.warn('[wpmClients] getOwnedWpmClient error, using fallback:', err);
    return {
      id: 'demo-client-001',
      name: 'Your Business',
    };
  }
}

/**
 * Update basic fields on the wpm_clients row.
 */
export async function updateClientProfile(clientId: string, updates: Partial<WpmClientRecord>) {
  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  const { error } = await (supabase as any)
    .from('wpm_clients')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clientId);

  if (error) throw error;
}

/**
 * Get the active bot profile for a client (used for tone + settings).
 */
export async function getActiveBotProfile(clientId: string): Promise<WpmBotProfileRecord | null> {
  if (!supabase) return null;

  const { data, error } = await (supabase as any)
    .from('wpm_bot_profiles')
    .select('id, client_id, name, public_name, template_key, tone, response_length, settings, is_active')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.warn('getActiveBotProfile error', error);
    return null;
  }
  return data as WpmBotProfileRecord | null;
}

/**
 * Update or create the active bot profile with business data (tone + settings).
 * If no active profile exists, creates a basic one using the common template.
 */
export async function upsertBotProfile(clientId: string, updates: { 
  name?: string; 
  public_name?: string; 
  tone?: string; 
  response_length?: string;
  settings?: Record<string, any>;
}) {
  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  // Try to find active profile
  let botProfile = await getActiveBotProfile(clientId);

  if (botProfile) {
    // Update existing
    const { error } = await (supabase as any)
      .from('wpm_bot_profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', botProfile.id);

    if (error) throw error;
    return botProfile.id;
  }

  // No active profile - create a minimal one (self-serve flow will create richer ones later)
  const { data, error } = await (supabase as any)
    .from('wpm_bot_profiles')
    .insert({
      client_id: clientId,
      name: updates.name || 'AI Assistant',
      public_name: updates.public_name || updates.name || 'AI Assistant',
      template_key: 'wpm-ai-receptionist',
      model_provider: 'openai',
      model_name: 'gpt-4.1-mini',
      tone: updates.tone || 'professional and friendly',
      language: 'en/es',
      response_length: updates.response_length || 'balanced',
      is_active: true,
      settings: updates.settings || {},
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

/**
 * Get the active instructions for a bot profile.
 */
export async function getBotInstructions(botProfileId: string): Promise<WpmBotInstructionsRecord | null> {
  if (!supabase) return null;

  const { data, error } = await (supabase as any)
    .from('wpm_bot_instructions')
    .select('*')
    .eq('bot_profile_id', botProfileId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.warn('getBotInstructions error', error);
    return null;
  }
  return data as WpmBotInstructionsRecord | null;
}

/**
 * Create or update the instructions for a bot profile.
 * Maps Agent Setup form fields to the instruction columns.
 */
export async function upsertBotInstructions(botProfileId: string, updates: {
  system_prompt?: string;
  business_summary?: string;
  faq_instructions?: string;
  lead_qualification_instructions?: string;
  handoff_rules?: string;
  never_say_rules?: string;
}) {
  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  // Check if instructions already exist for this profile
  const existing = await getBotInstructions(botProfileId);

  const payload = {
    bot_profile_id: botProfileId,
    system_prompt: updates.system_prompt || '',
    business_summary: updates.business_summary || null,
    faq_instructions: updates.faq_instructions || null,
    lead_qualification_instructions: updates.lead_qualification_instructions || null,
    handoff_rules: updates.handoff_rules || null,
    never_say_rules: updates.never_say_rules || null,
    is_active: true,
    version: existing ? (existing.version || 1) + 1 : 1,
  };

  if (existing) {
    const { error } = await (supabase as any)
      .from('wpm_bot_instructions')
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) throw error;
  } else {
    const { error } = await (supabase as any)
      .from('wpm_bot_instructions')
      .insert(payload);

    if (error) throw error;
  }
}

/**
 * List knowledge sources for a client (ready ones preferred).
 */
export async function listKnowledgeSources(clientId: string): Promise<KnowledgeSource[]> {
  if (!supabase) return [];

  const { data, error } = await (supabase as any)
    .from('wpm_knowledge_sources')
    .select('id, client_id, bot_profile_id, source_type, title, source_url, content_text, status, metadata')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('listKnowledgeSources error', error);
    return [];
  }
  return (data || []) as KnowledgeSource[];
}

/**
 * Create a new knowledge source row.
 */
export async function createKnowledgeSource(clientId: string, source: {
  title: string;
  content_text: string;
  source_type?: string;
  source_url?: string | null;
  tags?: string;
  bot_profile_id?: string | null;
}) {
  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  const sourceType = source.source_type || 'manual';
  const validTypes = ['manual', 'file', 'url', 'faq', 'notion', 'google_doc'];
  const finalType = validTypes.includes(sourceType) ? sourceType : 'manual';

  const metadata: Record<string, any> = {};
  if (source.tags) {
    metadata.tags = source.tags.split(',').map(t => t.trim()).filter(Boolean);
  }

  const { error } = await (supabase as any)
    .from('wpm_knowledge_sources')
    .insert({
      client_id: clientId,
      bot_profile_id: source.bot_profile_id || null,
      source_type: finalType,
      title: source.title,
      source_url: source.source_url || null,
      content_text: source.content_text,
      status: 'ready',           // immediately usable
      metadata,
    });

  if (error) throw error;
}

/**
 * Delete a knowledge source.
 */
export async function deleteKnowledgeSource(id: string) {
  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  const { error } = await (supabase as any)
    .from('wpm_knowledge_sources')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
