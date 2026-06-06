import { supabase } from './client';
import type { AgentSetupInput, AgentInstructionPayload, AgentProfilePayload } from '../wpm/agentSetup';
import { buildAgentInstructionPayload, buildAgentProfilePayload } from '../wpm/agentSetup';

export interface WpmBotProfileRecord {
  id: string;
  client_id: string;
  name: string;
  public_name: string | null;
  template_key: string | null;
  model_provider: string;
  model_name: string;
  tone: string;
  language: string;
  response_length: 'concise' | 'balanced' | 'detailed';
  booking_url: string | null;
  handoff_contact: string | null;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WpmBotInstructionRecord {
  id: string;
  bot_profile_id: string;
  system_prompt: string;
  business_summary: string | null;
  faq_instructions: string | null;
  lead_qualification_instructions: string | null;
  handoff_rules: string | null;
  never_say_rules: string | null;
  emergency_keywords: string[];
  lead_fields: string[];
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OwnedAgentSetupRecord {
  profile: WpmBotProfileRecord;
  instructions: WpmBotInstructionRecord | null;
}

export function mapAgentRecordToSetupInput(record: OwnedAgentSetupRecord): AgentSetupInput {
  return {
    id: record.profile.id,
    instruction_id: record.instructions?.id,
    template_key: record.profile.template_key ?? '',
    name: record.profile.name,
    public_name: record.profile.public_name ?? '',
    tone: record.profile.tone,
    language: record.profile.language,
    response_length: record.profile.response_length,
    booking_url: record.profile.booking_url ?? '',
    handoff_contact: record.profile.handoff_contact ?? '',
    system_prompt: record.instructions?.system_prompt ?? '',
    business_summary: record.instructions?.business_summary ?? '',
    faq_instructions: record.instructions?.faq_instructions ?? '',
    lead_qualification_instructions: record.instructions?.lead_qualification_instructions ?? '',
    handoff_rules: record.instructions?.handoff_rules ?? '',
    never_say_rules: record.instructions?.never_say_rules ?? '',
    emergency_keywords: record.instructions?.emergency_keywords?.join(', ') ?? '',
    lead_fields: record.instructions?.lead_fields?.join(', ') ?? '',
  };
}

export async function getOwnedAgentSetup(clientId: string): Promise<OwnedAgentSetupRecord | null> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data: profile, error: profileError } = await (supabase as any)
    .from('wpm_bot_profiles')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) return null;

  const { data: instructions, error: instructionError } = await (supabase as any)
    .from('wpm_bot_instructions')
    .select('*')
    .eq('bot_profile_id', profile.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (instructionError) throw instructionError;

  return {
    profile: profile as WpmBotProfileRecord,
    instructions: instructions as WpmBotInstructionRecord | null,
  };
}

export async function saveOwnedAgentSetup(input: AgentSetupInput, clientId: string): Promise<OwnedAgentSetupRecord> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const profilePayload: AgentProfilePayload = buildAgentProfilePayload(input, clientId);
  const { data: profile, error: profileError } = await (supabase as any)
    .from('wpm_bot_profiles')
    .upsert(profilePayload, { onConflict: 'id' })
    .select('*')
    .single();

  if (profileError) throw profileError;

  const instructionPayload: AgentInstructionPayload = buildAgentInstructionPayload(input, profile.id);
  const { data: instructions, error: instructionError } = await (supabase as any)
    .from('wpm_bot_instructions')
    .upsert(instructionPayload, { onConflict: 'id' })
    .select('*')
    .single();

  if (instructionError) throw instructionError;

  return {
    profile: profile as WpmBotProfileRecord,
    instructions: instructions as WpmBotInstructionRecord,
  };
}
