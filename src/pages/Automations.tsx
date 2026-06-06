import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Edit3, Loader2, Save, ShieldAlert, Zap } from 'lucide-react';
import { getOwnedWpmClient } from '../lib/supabase/wpmClients';
import {
  listOwnedIntegrations,
  mapIntegrationRecordToInput,
  saveOwnedIntegration,
  setOwnedIntegrationActive,
  WpmIntegrationRecord,
} from '../lib/supabase/wpmIntegrations';
import {
  AutomationInput,
  getAutomationCompletion,
  getIntegrationTypeLabel,
  IntegrationType,
  validateAutomationInput,
} from '../lib/wpm/automationSetup';

const DEFAULT_AUTOMATION: AutomationInput = {
  integration_type: 'zapier_webhook',
  name: '',
  webhook_url: '',
  email: '',
  field_map: '',
  secret_reference: '',
};

const INTEGRATION_TYPES: IntegrationType[] = ['zapier_webhook', 'email', 'custom_webhook', 'crm', 'calendar', 'slack'];

function Field({ label, children, error, help }: { label: string; children: React.ReactNode; error?: string; help?: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-secondary-foreground">{label}</span>
      {children}
      {help && <span className="block text-xs text-secondary-foreground">{help}</span>}
      {error && <span className="block text-sm text-red-400">{error}</span>}
    </label>
  );
}

function badgeClass(isActive: boolean): string {
  return isActive ? 'border-primary/30 bg-primary/10 text-primary' : 'border-secondary bg-secondary/60 text-secondary-foreground';
}

export default function Automations() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<WpmIntegrationRecord[]>([]);
  const [automation, setAutomation] = useState<AutomationInput>(DEFAULT_AUTOMATION);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const validationErrors = useMemo(() => validateAutomationInput(automation), [automation]);
  const completion = useMemo(() => getAutomationCompletion(integrations), [integrations]);

  useEffect(() => {
    let mounted = true;

    async function loadIntegrations() {
      try {
        setLoading(true);
        const client = await getOwnedWpmClient();

        if (!client) {
          if (mounted) setError('Create your Business Profile before configuring automations.');
          return;
        }

        const existing = await listOwnedIntegrations(client.id);
        if (mounted) {
          setClientId(client.id);
          setIntegrations(existing);
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load automations.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadIntegrations();

    return () => {
      mounted = false;
    };
  }, []);

  const updateField = (field: keyof AutomationInput, value: string) => {
    setAutomation((current) => ({ ...current, [field]: value }));
    setSuccess(null);
  };

  const reload = async (cid: string) => {
    const next = await listOwnedIntegrations(cid);
    setIntegrations(next);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!clientId) {
      setError('Create your Business Profile before saving automations.');
      return;
    }

    const errors = validateAutomationInput(automation);
    if (Object.keys(errors).length > 0) {
      setError('Fix the highlighted fields before saving.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await saveOwnedIntegration(automation, clientId);
      await reload(clientId);
      setAutomation(DEFAULT_AUTOMATION);
      setSuccess('Automation saved. Webhook URLs and secrets are stored server-side only.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save automation.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (record: WpmIntegrationRecord) => {
    setAutomation({ ...DEFAULT_AUTOMATION, ...mapIntegrationRecordToInput(record) });
    setSuccess(null);
  };

  const handleToggle = async (record: WpmIntegrationRecord) => {
    if (!clientId) return;
    try {
      setError(null);
      await setOwnedIntegrationActive(record.id, clientId, !record.is_active);
      await reload(clientId);
      setSuccess(record.is_active ? 'Automation paused.' : 'Automation activated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle.');
    }
  };

  return (
    <div className="min-h-full bg-background p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="overflow-hidden rounded-2xl border border-secondary bg-secondary/30">
          <div className="relative p-6 md:p-8">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/20" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm text-primary">
                  <Zap className="h-4 w-4" />
                  Step 5 · Automations
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Automations</h1>
                  <p className="mt-3 text-secondary-foreground">
                    Configure where qualified leads and events are sent: Zapier, n8n, custom webhooks, email notifications, CRM, etc. Webhook URLs and secrets stay server-side.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-secondary bg-background/80 p-5 shadow-lg backdrop-blur">
                <div className="text-sm text-secondary-foreground">Automation readiness</div>
                <div className="mt-1 text-4xl font-bold">{completion.percentComplete}%</div>
                <div className="mt-2 h-2 w-56 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${completion.percentComplete}%` }} />
                </div>
                <div className="mt-3 text-sm text-secondary-foreground">
                  {completion.activeCount} active of {completion.totalCount}
                </div>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
            <ShieldAlert className="mt-0.5 h-5 w-5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4 text-primary">
            <CheckCircle2 className="mt-0.5 h-5 w-5" />
            <span>{success}</span>
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-secondary bg-secondary/20 p-5 md:p-6">
            {loading ? (
              <div className="flex items-center gap-3 text-secondary-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading automations...
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">{automation.id ? 'Edit automation' : 'Add automation'}</h2>
                  {automation.id && <button type="button" onClick={() => setAutomation(DEFAULT_AUTOMATION)} className="rounded-lg border border-secondary px-3 py-2 text-sm hover:bg-secondary">New automation</button>}
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Automation type" error={validationErrors.integration_type}>
                    <select value={automation.integration_type} onChange={(e) => updateField('integration_type', e.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary">
                      {INTEGRATION_TYPES.map((t) => (
                        <option key={t} value={t}>{getIntegrationTypeLabel(t)}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Name" error={validationErrors.name}>
                    <input value={automation.name} onChange={(e) => updateField('name', e.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="New Lead → CRM" />
                  </Field>

                  <Field label="Webhook URL" error={validationErrors.webhook_url} help="For Zapier, n8n, custom webhooks. This will be encrypted server-side.">
                    <input value={automation.webhook_url} onChange={(e) => updateField('webhook_url', e.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="https://hooks.zapier.com/..." />
                  </Field>

                  <Field label="Email (for email notifications)">
                    <input value={automation.email} onChange={(e) => updateField('email', e.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="leads@yourbusiness.com" />
                  </Field>

                  <Field label="Field map (comma separated)">
                    <input value={automation.field_map} onChange={(e) => updateField('field_map', e.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="name, phone, service_interest, email" />
                  </Field>

                  <Field label="Secret reference (server-side key name)">
                    <input value={automation.secret_reference} onChange={(e) => updateField('secret_reference', e.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="zapier_leads_secret" />
                  </Field>
                </div>

                <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-primary">
                  Secrets and webhook URLs are never stored in plain text in the browser. The WPM Bridge executes the delivery using encrypted references.
                </div>

                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {automation.id ? 'Update automation' : 'Save automation'}
                </button>
              </>
            )}
          </form>

          <aside className="space-y-5">
            <div className="rounded-2xl border border-secondary bg-secondary/20 p-5">
              <h2 className="font-semibold">MVP requirement</h2>
              <p className="mt-3 text-sm text-secondary-foreground">At least one active automation (Zapier, n8n, custom webhook or email) is recommended before launch so leads are routed without manual copy/paste.</p>
            </div>

            <div className="rounded-2xl border border-secondary bg-secondary/20 p-5">
              <h2 className="font-semibold">Launch blockers</h2>
              {completion.blockers.length === 0 ? (
                <p className="mt-3 text-sm text-primary">Automation destination configured.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm text-secondary-foreground">
                  {completion.blockers.map((b) => <li key={b}>• {b}</li>)}
                </ul>
              )}
            </div>
          </aside>
        </section>

        <section className="rounded-2xl border border-secondary bg-secondary/20 p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Saved automations</h2>
            <span className="text-sm text-secondary-foreground">{integrations.length} total</span>
          </div>

          {integrations.length === 0 ? (
            <p className="mt-4 text-secondary-foreground">No automations yet. Add a Zapier webhook, email notification, or custom endpoint above.</p>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {integrations.map((record) => (
                <article key={record.id} className="rounded-xl border border-secondary bg-background/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-secondary-foreground">{getIntegrationTypeLabel(record.integration_type)}</div>
                      <h3 className="mt-1 font-semibold">{record.name}</h3>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-xs ${badgeClass(record.is_active)}`}>{record.is_active ? 'active' : 'paused'}</span>
                  </div>

                  {record.metadata?.webhook_url && <p className="mt-2 truncate text-sm text-primary">{record.metadata.webhook_url}</p>}
                  {record.metadata?.email && <p className="mt-1 text-sm">{record.metadata.email}</p>}

                  <div className="mt-4 flex gap-2">
                    <button type="button" onClick={() => handleEdit(record)} className="inline-flex items-center gap-2 rounded-lg border border-secondary px-3 py-2 text-sm hover:bg-secondary">
                      <Edit3 className="h-4 w-4" />
                      Edit
                    </button>
                    <button type="button" onClick={() => handleToggle(record)} className="rounded-lg border border-secondary px-3 py-2 text-sm hover:bg-secondary">
                      {record.is_active ? 'Pause' : 'Activate'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
