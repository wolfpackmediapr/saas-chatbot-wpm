import { useEffect, useState } from 'react';
import { Zap, ToggleLeft, ToggleRight, Save, AlertCircle } from 'lucide-react';
import { getOwnedWpmClient, listIntegrations, upsertIntegration } from '../lib/supabase/wpmClients';
import { cn } from '../lib/utils';

interface AutomationDef {
  id: string;
  name: string;
  description: string;
  type: 'webhook' | 'email' | 'crm';
  integration_type: string;
  provider: string;
}

const AUTOMATION_DEFS: AutomationDef[] = [
  {
    id: 'qualified-lead',
    name: 'Qualified Lead Webhook',
    description: 'Send structured lead data to Zapier / Make / n8n (or any custom webhook) when the AI marks a prospect as high-intent.',
    type: 'webhook',
    integration_type: 'zapier_webhook',
    provider: 'zapier',
  },
  {
    id: 'email-notification',
    name: 'Email Notification',
    description: 'Automatically email your team (via Resend) when a qualified lead is captured. Great for immediate follow-up.',
    type: 'email',
    integration_type: 'email',
    provider: 'resend',
  },
  {
    id: 'crm-sync',
    name: 'CRM Sync',
    description: 'Push new leads + conversation summaries to your CRM (HubSpot, Pipedrive, Airtable, etc.).',
    type: 'crm',
    integration_type: 'crm',
    provider: 'crm',
  },
];

interface AutomationState {
  enabled: boolean;
  configValue: string; // webhook url or email(s)
}

export default function Automations() {
  const [client, setClient] = useState<any>(null);
  const [states, setStates] = useState<Record<string, AutomationState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load client + existing integrations
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const c = await getOwnedWpmClient();
        if (!c) {
          setError('No client profile found. Please complete Business Profile first.');
          // Treat as demo so toggles don't crash on null client
          const fallback: Record<string, AutomationState> = {};
          AUTOMATION_DEFS.forEach(def => {
            fallback[def.id] = { enabled: def.id === 'email-notification', configValue: '' };
          });
          setStates(fallback);
          setDemoMode(true);
          setLoading(false);
          return;
        }
        setClient(c);

        // Demo mode detection (improved logic)
        const hasSupabaseEnv = !!import.meta.env.VITE_SUPABASE_URL;
        const isOnVercel = window.location.hostname.includes('vercel');
        const isDemo = !c.id || c.id === 'demo-client-001' || (!isOnVercel && !hasSupabaseEnv);
        setDemoMode(isDemo);

        // Initialize default states
        const initialStates: Record<string, AutomationState> = {};
        AUTOMATION_DEFS.forEach(def => {
          initialStates[def.id] = { enabled: def.id === 'email-notification', configValue: '' };
        });

        if (isDemo) {
          // Nice demo data
          initialStates['qualified-lead'] = { enabled: true, configValue: 'https://hooks.zapier.com/hooks/catch/123456/abc123/' };
          initialStates['email-notification'] = { enabled: true, configValue: 'team@yourbusiness.com, sales@yourbusiness.com' };
          initialStates['crm-sync'] = { enabled: false, configValue: '' };
          setStates(initialStates);
          setLoading(false);
          return;
        }

        // Load real integrations
        const integrations = await listIntegrations(c.id);

        AUTOMATION_DEFS.forEach(def => {
          const match = integrations.find(i => i.integration_type === def.integration_type);
          if (match) {
            let configVal = '';
            if (def.type === 'webhook') {
              configVal = match.metadata?.webhook_url || match.metadata?.url || '';
            } else if (def.type === 'email') {
              configVal = (match.metadata?.recipients || []).join(', ') || match.metadata?.email || '';
            } else {
              configVal = match.metadata?.crm_url || '';
            }
            initialStates[def.id] = {
              enabled: match.is_active,
              configValue: configVal,
            };
          }
        });

        setStates(initialStates);
      } catch (e: any) {
        console.error('Failed to load automations', e);
        setError(e.message || 'Failed to load automations');
        // Fallback to demo-like state
        const fallback: Record<string, AutomationState> = {};
        AUTOMATION_DEFS.forEach(def => {
          fallback[def.id] = { enabled: def.id === 'email-notification', configValue: '' };
        });
        setStates(fallback);
        setDemoMode(true);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const toggleAutomation = async (def: AutomationDef) => {
    const current = states[def.id] || { enabled: false, configValue: '' };
    const newEnabled = !current.enabled;

    // Optimistic update
    setStates(prev => ({
      ...prev,
      [def.id]: { ...current, enabled: newEnabled },
    }));

    if (!client) {
      setError('No client profile found. Please complete Business Profile first.');
      return;
    }
    if (demoMode) {
      // Just local state in demo
      return;
    }

    try {
      setSavingId(def.id);

      // Find or create the integration row
      await upsertIntegration(client.id, {
        provider: def.provider,
        integration_type: def.integration_type,
        name: def.name,
        is_active: newEnabled,
        metadata: buildMetadata(def, current.configValue),
      });
    } catch (e: any) {
      // Revert on error
      setStates(prev => ({
        ...prev,
        [def.id]: { ...current, enabled: !newEnabled },
      }));
      setError(e.message || 'Failed to update automation');
    } finally {
      setSavingId(null);
    }
  };

  const saveConfig = async (def: AutomationDef) => {
    const current = states[def.id];
    if (!current) return;

    if (!client) {
      setError('No client profile found. Please complete Business Profile first.');
      return;
    }
    if (demoMode) {
      alert('Saved in demo mode (local only). In production this will be stored securely and used by the WPM Actions Processor.');
      return;
    }

    setSavingId(def.id);
    setError(null);

    try {
      await upsertIntegration(client.id, {
        provider: def.provider,
        integration_type: def.integration_type,
        name: def.name,
        is_active: current.enabled,
        metadata: buildMetadata(def, current.configValue),
        field_map: def.type === 'webhook' ? {
          full_name: 'full_name',
          email: 'email',
          phone: 'phone',
          service_interest: 'service_interest',
          source_channel: 'source_channel',
        } : undefined,
      });

      // Success feedback
      const btn = document.getElementById(`save-${def.id}`);
      if (btn) {
        const original = btn.textContent;
        btn.textContent = 'Saved!';
        setTimeout(() => {
          if (btn) btn.textContent = original || 'Save';
        }, 1200);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to save configuration');
    } finally {
      setSavingId(null);
    }
  };

  const updateConfigValue = (id: string, value: string) => {
    setStates(prev => ({
      ...prev,
      [id]: { ...prev[id], configValue: value },
    }));
  };

  function buildMetadata(def: AutomationDef, configValue: string): Record<string, any> {
    if (def.type === 'webhook') {
      return { webhook_url: configValue.trim() };
    }
    if (def.type === 'email') {
      const emails = configValue.split(',').map(e => e.trim()).filter(Boolean);
      return { recipients: emails };
    }
    return { config: configValue.trim() };
  }

  const getState = (id: string): AutomationState => states[id] || { enabled: false, configValue: '' };

  if (loading) {
    return (
      <div className="p-6 max-w-4xl">
        <div className="animate-pulse space-y-4">
          <div className="h-9 w-64 bg-secondary/50 rounded" />
          <div className="h-5 w-96 bg-secondary/30 rounded" />
          {[1,2,3].map(i => <div key={i} className="h-32 bg-secondary/20 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Zap className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-semibold">Automations</h1>
        </div>
        <p className="text-secondary-foreground">
          Automatically route qualified leads to your tools. No manual copy-paste.
        </p>
        {demoMode && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5 text-sm text-yellow-400">
            <AlertCircle className="h-4 w-4" />
            Demo mode — changes are local only. Connect live Supabase to persist to wpm_integrations.
          </div>
        )}
        {error && (
          <div className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {AUTOMATION_DEFS.map((def) => {
          const state = getState(def.id);
          const isSaving = savingId === def.id;

          return (
            <div key={def.id} className="bg-secondary/30 border border-secondary rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-6">
                <div className="flex-1">
                  <div className="font-semibold text-lg mb-1 flex items-center gap-2">
                    {def.name}
                    {state.enabled && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-primary/20 text-primary">ACTIVE</span>
                    )}
                  </div>
                  <p className="text-sm text-secondary-foreground mb-3">{def.description}</p>

                  {/* Config inputs - only show when enabled */}
                  {state.enabled && (
                    <div className="mt-1 space-y-2">
                      {def.type === 'webhook' && (
                        <>
                          <label className="text-xs text-secondary-foreground">Webhook URL</label>
                          <input
                            type="url"
                            placeholder="https://hooks.zapier.com/hooks/catch/..."
                            value={state.configValue}
                            onChange={(e) => updateConfigValue(def.id, e.target.value)}
                            className="w-full text-sm rounded-lg border border-secondary bg-background px-3 py-2 font-mono"
                            disabled={isSaving}
                          />
                        </>
                      )}

                      {def.type === 'email' && (
                        <>
                          <label className="text-xs text-secondary-foreground">Email recipients (comma separated)</label>
                          <input
                            type="text"
                            placeholder="you@company.com, team@company.com"
                            value={state.configValue}
                            onChange={(e) => updateConfigValue(def.id, e.target.value)}
                            className="w-full text-sm rounded-lg border border-secondary bg-background px-3 py-2"
                            disabled={isSaving}
                          />
                        </>
                      )}

                      {def.type === 'crm' && (
                        <>
                          <label className="text-xs text-secondary-foreground">CRM / Webhook target (optional for now)</label>
                          <input
                            type="text"
                            placeholder="https://hooks.yourcrm.com/..."
                            value={state.configValue}
                            onChange={(e) => updateConfigValue(def.id, e.target.value)}
                            className="w-full text-sm rounded-lg border border-secondary bg-background px-3 py-2"
                            disabled={isSaving}
                          />
                        </>
                      )}

                      <button
                        id={`save-${def.id}`}
                        onClick={() => saveConfig(def)}
                        disabled={isSaving || (def.type !== 'crm' && !state.configValue.trim())}
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition",
                          "bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
                        )}
                      >
                        <Save className="h-3.5 w-3.5" />
                        {isSaving ? 'Saving...' : 'Save Configuration'}
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => toggleAutomation(def)}
                  disabled={isSaving}
                  className="mt-1 shrink-0"
                  title={state.enabled ? 'Disable automation' : 'Enable automation'}
                >
                  {state.enabled ? (
                    <ToggleRight className="h-8 w-8 text-primary" />
                  ) : (
                    <ToggleLeft className="h-8 w-8 text-secondary-foreground" />
                  )}
                </button>
              </div>

              {def.type === 'webhook' && state.enabled && state.configValue && (
                <div className="text-[11px] text-secondary-foreground/70 pl-1">
                  This URL will be called by the WPM Actions Processor when a qualified lead is detected.
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8 text-sm text-secondary-foreground bg-secondary/20 border border-secondary rounded-xl p-4 space-y-2">
        <div className="font-medium">How automations work</div>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>When the AI qualifies a lead (using your lead qualification rules), it creates a record in <code>wpm_leads</code> and queues work in <code>wpm_tool_executions</code>.</li>
          <li>The secure WPM Actions Processor (edge function) picks up active integrations from <code>wpm_integrations</code> and delivers the payload.</li>
          <li>Webhooks receive clean JSON. Emails are sent via Resend. Everything is logged for auditing.</li>
        </ul>
        <div className="pt-1 text-xs opacity-70">
          You can also trigger the processor manually from the <strong>Launch Checklist</strong> page (one-click "Process pending automations").
        </div>
      </div>
    </div>
  );
}
