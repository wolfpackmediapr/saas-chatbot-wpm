import { supabase } from './client';

export interface WpmLeadRecord {
  id: string;
  client_id: string;
  conversation_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  service_interest: string | null;
  intent: string | null;
  qualification_data: Record<string, any>;
  source_channel: string | null;
  status: 'new' | 'qualified' | 'sent_to_crm' | 'handoff' | 'closed' | 'lost';
  assigned_to: string | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function listOwnedLeads(clientId: string, limit: number = 50): Promise<WpmLeadRecord[]> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await (supabase as any)
    .from('wpm_leads')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data || []) as WpmLeadRecord[];
}

export function getStatusColor(status: WpmLeadRecord['status']): string {
  switch (status) {
    case 'new': return 'bg-blue-500/20 text-blue-400';
    case 'qualified': return 'bg-emerald-500/20 text-emerald-400';
    case 'sent_to_crm': return 'bg-purple-500/20 text-purple-400';
    case 'handoff': return 'bg-amber-500/20 text-amber-400';
    case 'closed': return 'bg-gray-500/20 text-gray-400';
    case 'lost': return 'bg-red-500/20 text-red-400';
    default: return 'bg-secondary text-secondary-foreground';
  }
}
