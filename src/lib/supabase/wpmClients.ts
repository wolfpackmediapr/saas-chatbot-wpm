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

export interface WpmClientChannel {
  id: string;
  client_id: string;
  channel_type: string;
  provider: string;
  provider_channel_id: string;
  is_active: boolean;
  metadata?: Record<string, any>;
}

export interface WpmIntegration {
  id: string;
  client_id: string;
  provider: string;
  integration_type: string;
  name: string;
  secret_reference?: string | null;
  is_active: boolean;
  metadata?: Record<string, any>;
  field_map?: Record<string, any>;
}

/**
 * Returns the current authenticated user's owned WPM client profile.
 * Creates the client record if it doesn't exist (lazy creation).
 */
export async function getOwnedWpmClient(): Promise<WpmClientRecord | null> {
  if (!supabase) {
    return {
      id: 'demo-client-001',
      name: 'Demo Business',
      description: 'Local development / bolt.new preview client',
    };
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Try to get existing client
    let { data, error } = await (supabase as any)
      .from('wpm_clients')
      .select('id, name, description, timezone, status, website_url, contact_email, contact_phone, industry, notes')
      .eq('owner_user_id', user.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('[wpmClients] getOwnedWpmClient query error', error);
    }

    if (!data) {
      // Lazy create: no client exists for this user, create one
      const userEmail = user.email ?? '';
      const userName = user.user_metadata?.full_name ?? userEmail?.split('@')[0] ?? 'Your Business';
      
      const { data: newClient, error: insertError } = await (supabase as any)
        .from('wpm_clients')
        .insert({
          owner_user_id: user.id,
          name: userName,
          status: 'draft',
          timezone: 'America/Puerto_Rico',
          contact_email: userEmail,
        })
        .select('id, name, description, timezone, status, website_url, contact_email, contact_phone, industry, notes')
        .single();

      if (insertError) {
        console.error('[wpmClients] Failed to create client', insertError);
        return { id: user.id, name: 'Your Business' };
      }
      
      data = newClient;
    }

    return data as WpmClientRecord;
  } catch (err) {
    console.warn('[wpmClients] getOwnedWpmClient error', err);
    return { id: 'demo-client-001', name: 'Your Business' };
  }
}

export async function updateClientProfile(clientId: string, updates: Partial<WpmClientRecord>) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await (supabase as any)
    .from('wpm_clients')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', clientId);
  if (error) throw error;
}

export async function getActiveBotProfile(clientId: string): Promise<WpmBotProfileRecord | null> {
  if (!supabase) return null;
  const { data, error } = await (supabase as any)
    .from('wpm_bot_profiles')
    .select('id, client_id, name, public_name, template_key, tone, response_length, settings, is_active')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) return null;
  return data as WpmBotProfileRecord | null;
}

export async function upsertBotProfile(clientId: string, updates: { 
  name?: string; public_name?: string; tone?: string; response_length?: string; settings?: Record<string, any>;
}) {
  if (!supabase) throw new Error('Supabase not configured');
  const botProfile = await getActiveBotProfile(clientId);
  if (botProfile) {
    const { error } = await (supabase as any)
      .from('wpm_bot_profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', botProfile.id);
    if (error) throw error;
    return botProfile.id;
  }
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

export async function getBotInstructions(botProfileId: string): Promise<WpmBotInstructionsRecord | null> {
  if (!supabase) return null;
  const { data, error } = await (supabase as any)
    .from('wpm_bot_instructions')
    .select('*')
    .eq('bot_profile_id', botProfileId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) return null;
  return data as WpmBotInstructionsRecord | null;
}

export async function upsertBotInstructions(botProfileId: string, updates: {
  system_prompt?: string; business_summary?: string; faq_instructions?: string;
  lead_qualification_instructions?: string; handoff_rules?: string; never_say_rules?: string;
}) {
  if (!supabase) throw new Error('Supabase not configured');
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
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await (supabase as any)
      .from('wpm_bot_instructions')
      .insert(payload);
    if (error) throw error;
  }
}

export async function listKnowledgeSources(clientId: string): Promise<KnowledgeSource[]> {
  if (!supabase) return [];
  const { data, error } = await (supabase as any)
    .from('wpm_knowledge_sources')
    .select('id, client_id, bot_profile_id, source_type, title, source_url, content_text, status, metadata')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data || []) as KnowledgeSource[];
}

export async function createKnowledgeSource(clientId: string, source: {
  title: string; content_text: string; source_type?: string; source_url?: string | null; tags?: string; bot_profile_id?: string | null;
}) {
  if (!supabase) throw new Error('Supabase not configured');
  const sourceType = source.source_type || 'manual';
  const validTypes = ['manual', 'file', 'url', 'faq', 'notion', 'google_doc'];
  const finalType = validTypes.includes(sourceType) ? sourceType : 'manual';
  const metadata: Record<string, any> = {};
  if (source.tags) metadata.tags = source.tags.split(',').map(t => t.trim()).filter(Boolean);
  if (source.source_type) metadata.ui_type = source.source_type; // preserve UI type

  const { error } = await (supabase as any)
    .from('wpm_knowledge_sources')
    .insert({
      client_id: clientId,
      bot_profile_id: source.bot_profile_id || null,
      source_type: finalType,
      title: source.title,
      source_url: source.source_url || null,
      content_text: source.content_text,
      status: 'ready',
      metadata,
    });
  if (error) throw error;
}

export async function deleteKnowledgeSource(id: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await (supabase as any).from('wpm_knowledge_sources').delete().eq('id', id);
  if (error) throw error;
}

// Channel helpers
export async function listClientChannels(clientId: string): Promise<WpmClientChannel[]> {
  if (!supabase) return [];
  const { data, error } = await (supabase as any)
    .from('wpm_client_channels')
    .select('id, client_id, channel_type, provider, provider_channel_id, is_active, metadata')
    .eq('client_id', clientId)
    .eq('is_active', true);
  if (error) return [];
  return (data || []) as WpmClientChannel[];
}

export async function upsertClientChannel(clientId: string, channel: {
  provider: string;
  provider_channel_id: string;
  channel_type: string;
  metadata?: Record<string, any>;
}) {
  if (!supabase) throw new Error('Supabase not configured');
  // Try to find existing for this provider + channel_type combination
  const { data: existing } = await (supabase as any)
    .from('wpm_client_channels')
    .select('id')
    .eq('client_id', clientId)
    .eq('provider', channel.provider)
    .eq('channel_type', channel.channel_type)
    .maybeSingle();

  if (existing) {
    const { error } = await (supabase as any)
      .from('wpm_client_channels')
      .update({
        provider_channel_id: channel.provider_channel_id,
        channel_type: channel.channel_type,
        metadata: channel.metadata || {},
        is_active: true,
      })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await (supabase as any)
      .from('wpm_client_channels')
      .insert({
        client_id: clientId,
        provider: channel.provider,
        provider_channel_id: channel.provider_channel_id,
        channel_type: channel.channel_type,
        is_active: true,
        metadata: channel.metadata || {},
      });
    if (error) throw error;
  }
}

export async function deactivateClientChannel(clientId: string, channelType: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await (supabase as any)
    .from('wpm_client_channels')
    .update({ is_active: false })
    .eq('client_id', clientId)
    .eq('channel_type', channelType);
  if (error) throw error;
}

// === Integrations / Automations helpers ===

export async function listIntegrations(clientId: string): Promise<WpmIntegration[]> {
  if (!supabase) return [];
  const { data, error } = await (supabase as any)
    .from('wpm_integrations')
    .select('id, client_id, provider, integration_type, name, secret_reference, is_active, metadata, field_map')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[wpmClients] listIntegrations error', error);
    return [];
  }
  return (data || []) as WpmIntegration[];
}

export async function upsertIntegration(clientId: string, integ: {
  provider: string;
  integration_type: string;
  name: string;
  metadata?: Record<string, any>;
  field_map?: Record<string, any>;
  is_active?: boolean;
}): Promise<string> {
  if (!supabase) throw new Error('Supabase not configured');

  // Find existing by client + integration_type (one per type per client)
  const { data: existing } = await (supabase as any)
    .from('wpm_integrations')
    .select('id')
    .eq('client_id', clientId)
    .eq('integration_type', integ.integration_type)
    .maybeSingle();

  const payload: any = {
    client_id: clientId,
    provider: integ.provider,
    integration_type: integ.integration_type,
    name: integ.name,
    is_active: integ.is_active ?? true,
    metadata: integ.metadata || {},
    field_map: integ.field_map || {},
  };

  if (existing?.id) {
    const { error } = await (supabase as any)
      .from('wpm_integrations')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw error;
    return existing.id;
  } else {
    const { data, error } = await (supabase as any)
      .from('wpm_integrations')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }
}

export async function setIntegrationActive(integrationId: string, isActive: boolean) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await (supabase as any)
    .from('wpm_integrations')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', integrationId);
  if (error) throw error;
}
