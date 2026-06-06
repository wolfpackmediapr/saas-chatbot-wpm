import { supabase } from './client';
import type { TestInput, TestConversationPayload } from '../wpm/agentSimulator';
import { buildTestMessagePayload } from '../wpm/agentSimulator';

export interface TestConversationRecord {
  id: string;
  client_id: string;
  source_channel: string;
  initial_message: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  test_mode: boolean;
  status: string;
  agent_reply?: string;
  lead_extracted?: Record<string, string>;
  automation_triggered?: boolean;
  created_at: string;
}

export async function saveTestConversation(input: TestInput, clientId: string, simulationResult: {
  reply: string;
  should_trigger_automation: boolean;
  extracted_lead: Record<string, string>;
}): Promise<TestConversationRecord> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const payload: TestConversationPayload = buildTestMessagePayload(input, clientId);

  const { data, error } = await (supabase as any)
    .from('wpm_conversations')
    .insert({
      ...payload,
      agent_reply: simulationResult.reply,
      lead_extracted: simulationResult.extracted_lead,
      automation_triggered: simulationResult.should_trigger_automation,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as TestConversationRecord;
}

export async function listRecentTestConversations(clientId: string, limit = 10): Promise<TestConversationRecord[]> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await (supabase as any)
    .from('wpm_conversations')
    .select('*')
    .eq('client_id', clientId)
    .eq('test_mode', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as TestConversationRecord[];
}
