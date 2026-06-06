import { supabase } from './client';
import type { AutomationInput, AutomationPayload, IntegrationType } from '../wpm/automationSetup';
import { buildIntegrationPayload } from '../wpm/automationSetup';

export interface WpmIntegrationRecord {
  id: string;
  client_id: string;
  provider: string;
  integration_type: IntegrationType;
  name: string;
  secret_reference: string | null;
  webhook_url_encrypted: string | null;
  field_map: { fields?: string[] };
  is_active: boolean;
  metadata: {
    self_setup?: boolean;
    secret_storage?: 'server_side_only';
    webhook_url?: string | null;
    email?: string | null;
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}

export function mapIntegrationRecordToInput(record: WpmIntegrationRecord): AutomationInput {
  return {
    id: record.id,
    integration_type: record.integration_type,
    provider: record.provider as any,
    name: record.name,
    webhook_url: record.metadata?.webhook_url ?? '',
    email: record.metadata?.email ?? '',
    field_map: Array.isArray(record.field_map?.fields) ? record.field_map.fields.join(', ') : '',
    secret_reference: record.secret_reference ?? '',
  };
}

export async function listOwnedIntegrations(clientId: string): Promise<WpmIntegrationRecord[]> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await (supabase as any)
    .from('wpm_integrations')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []) as WpmIntegrationRecord[];
}

export async function saveOwnedIntegration(input: AutomationInput, clientId: string): Promise<WpmIntegrationRecord> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const payload: AutomationPayload = buildIntegrationPayload(input, clientId);
  const { data, error } = await (supabase as any)
    .from('wpm_integrations')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) throw error;

  return data as WpmIntegrationRecord;
}

export async function setOwnedIntegrationActive(id: string, clientId: string, isActive: boolean): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { error } = await (supabase as any)
    .from('wpm_integrations')
    .update({ is_active: isActive })
    .eq('id', id)
    .eq('client_id', clientId);

  if (error) throw error;
}
