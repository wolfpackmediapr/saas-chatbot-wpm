import React, { useState, useEffect } from 'react';
import { Users, RefreshCw, ExternalLink } from 'lucide-react';
import { getOwnedWpmClient } from '../lib/supabase/wpmClients';
import { listOwnedLeads, WpmLeadRecord, getStatusColor } from '../lib/supabase/wpmLeads';

export default function Leads() {
  const [leads, setLeads] = useState<WpmLeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string>('');

  const loadLeads = async () => {
    setLoading(true);
    setError(null);

    try {
      const client = await getOwnedWpmClient();
      if (!client) {
        setError('No business profile found. Complete Business Profile first.');
        setLeads([]);
        return;
      }

      setClientName(client.name);
      const data = await listOwnedLeads(client.id);
      setLeads(data);
    } catch (err) {
      console.error('Failed to load leads:', err);
      setError(err instanceof Error ? err.message : 'Failed to load leads');
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-lg">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Leads</h1>
              <p className="text-sm text-secondary-foreground">
                Qualified leads captured by your AI DM Agent {clientName ? `for ${clientName}` : ''}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={loadLeads}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64 text-secondary-foreground">
          Loading leads...
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-secondary/50 rounded-xl p-8 text-center">
          <Users className="h-12 w-12 mx-auto mb-4 text-secondary-foreground/50" />
          <h3 className="text-lg font-semibold mb-2">No leads yet</h3>
          <p className="text-sm text-secondary-foreground max-w-md mx-auto">
            Leads will appear here once your AI agent qualifies conversations or you use the <strong>Test Agent</strong> page to simulate and queue leads.
          </p>
          <p className="text-xs text-secondary-foreground mt-4">
            Make sure you have active automations configured if you want leads automatically routed.
          </p>
        </div>
      ) : (
        <div className="bg-secondary/50 rounded-xl overflow-hidden border border-secondary">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-background/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-secondary-foreground">Contact</th>
                  <th className="px-4 py-3 font-medium text-secondary-foreground">Interest / Intent</th>
                  <th className="px-4 py-3 font-medium text-secondary-foreground">Status</th>
                  <th className="px-4 py-3 font-medium text-secondary-foreground">Source</th>
                  <th className="px-4 py-3 font-medium text-secondary-foreground">Created</th>
                  <th className="px-4 py-3 font-medium text-secondary-foreground w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-background/30 transition-colors">
                    <td className="px-4 py-4">
                      <div className="font-medium">{lead.full_name || 'Unknown'}</div>
                      <div className="text-xs text-secondary-foreground mt-0.5">
                        {lead.email || 'no email'} {lead.phone ? `• ${lead.phone}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm">{lead.service_interest || lead.intent || '—'}</div>
                      {lead.qualification_data && Object.keys(lead.qualification_data).length > 0 && (
                        <div className="text-xs text-secondary-foreground mt-1 line-clamp-2">
                          {JSON.stringify(lead.qualification_data).slice(0, 120)}...
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(lead.status)}`}>
                        {lead.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-secondary-foreground">
                      {lead.source_channel || '—'}
                    </td>
                    <td className="px-4 py-4 text-sm text-secondary-foreground">
                      {formatDate(lead.created_at)}
                    </td>
                    <td className="px-4 py-4">
                      {lead.conversation_id && (
                        <a 
                          href={`/history?conversation=${lead.conversation_id}`} 
                          className="text-primary hover:text-primary-hover"
                          title="View conversation"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-background/30 text-xs text-secondary-foreground border-t border-secondary">
            Showing {leads.length} most recent lead{leads.length !== 1 ? 's' : ''}. 
            New leads are captured automatically by the WPM Bridge when conversations qualify.
          </div>
        </div>
      )}

      <div className="mt-6 text-xs text-secondary-foreground">
        Leads are stored securely in your Supabase project and respect your client ownership rules.
      </div>
    </div>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}
