import { supabase } from './client';
import type {
  KnowledgeSourceInput,
  KnowledgeSourcePayload,
  KnowledgeSourceStatus,
  KnowledgeSourceType,
} from '../wpm/knowledgeSetup';
import { buildKnowledgeSourcePayload } from '../wpm/knowledgeSetup';

export interface WpmKnowledgeSourceRecord {
  id: string;
  client_id: string;
  bot_profile_id: string | null;
  source_type: KnowledgeSourceType;
  title: string;
  source_url: string | null;
  storage_path: string | null;
  content_text: string | null;
  external_vector_store_id: string | null;
  external_file_id: string | null;
  status: KnowledgeSourceStatus;
  metadata: {
    self_setup?: boolean;
    tags?: string[];
    audience?: string | null;
    priority?: 'low' | 'normal' | 'high';
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}

function metadataTags(record: WpmKnowledgeSourceRecord): string {
  return Array.isArray(record.metadata?.tags) ? record.metadata.tags.join(', ') : '';
}

export function mapKnowledgeRecordToInput(record: WpmKnowledgeSourceRecord): KnowledgeSourceInput {
  return {
    id: record.id,
    source_type: record.source_type,
    title: record.title,
    source_url: record.source_url ?? '',
    content_text: record.content_text ?? '',
    tags: metadataTags(record),
    audience: typeof record.metadata?.audience === 'string' ? record.metadata.audience : '',
    priority: record.metadata?.priority ?? 'normal',
  };
}

export async function listOwnedKnowledgeSources(clientId: string): Promise<WpmKnowledgeSourceRecord[]> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await (supabase as any)
    .from('wpm_knowledge_sources')
    .select('*')
    .eq('client_id', clientId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []) as WpmKnowledgeSourceRecord[];
}

export async function saveOwnedKnowledgeSource(
  input: KnowledgeSourceInput,
  clientId: string,
  botProfileId?: string | null,
): Promise<WpmKnowledgeSourceRecord> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const payload: KnowledgeSourcePayload = buildKnowledgeSourcePayload(input, clientId, botProfileId);
  const { data, error } = await (supabase as any)
    .from('wpm_knowledge_sources')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) throw error;

  return data as WpmKnowledgeSourceRecord;
}

export async function archiveOwnedKnowledgeSource(id: string, clientId: string): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { error } = await (supabase as any)
    .from('wpm_knowledge_sources')
    .update({ status: 'archived' })
    .eq('id', id)
    .eq('client_id', clientId);

  if (error) throw error;
}
