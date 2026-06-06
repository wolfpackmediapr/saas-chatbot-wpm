import { supabase } from './client';
import type { BusinessProfileInput, ClientUpsertPayload } from '../wpm/selfSetup';
import { buildClientUpsertPayload } from '../wpm/selfSetup';

export interface WpmClientRecord {
  id: string;
  owner_user_id: string;
  name: string;
  slug: string | null;
  industry: string | null;
  website_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  timezone: string | null;
  status: 'draft' | 'setup' | 'active' | 'paused' | 'archived';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function parseNotes(notes: string | null): Pick<BusinessProfileInput, 'preferred_language' | 'brand_voice'> {
  if (!notes) return {};

  const preferredLanguage = notes.match(/^Preferred language:\s*(.+)$/m)?.[1]?.trim();
  const brandVoice = notes.match(/^Brand voice:\s*(.+)$/m)?.[1]?.trim();

  return {
    preferred_language: preferredLanguage ?? '',
    brand_voice: brandVoice ?? '',
  };
}

export function mapClientRecordToBusinessProfile(record: WpmClientRecord): BusinessProfileInput {
  return {
    id: record.id,
    name: record.name,
    industry: record.industry ?? '',
    website_url: record.website_url ?? '',
    contact_name: record.contact_name ?? '',
    contact_email: record.contact_email ?? '',
    contact_phone: record.contact_phone ?? '',
    timezone: record.timezone ?? 'America/Puerto_Rico',
    ...parseNotes(record.notes),
  };
}

export async function getOwnedWpmClient(): Promise<WpmClientRecord | null> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await (supabase as any)
    .from('wpm_clients')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as WpmClientRecord | null;
}

export async function saveOwnedWpmClient(input: BusinessProfileInput, ownerUserId: string): Promise<WpmClientRecord> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const payload: ClientUpsertPayload = buildClientUpsertPayload(input, ownerUserId);
  const { data, error } = await (supabase as any)
    .from('wpm_clients')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as WpmClientRecord;
}
