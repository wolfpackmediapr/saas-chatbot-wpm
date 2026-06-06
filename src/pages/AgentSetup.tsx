import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, Loader2, Save, ShieldAlert, Wand2 } from 'lucide-react';
import { getOwnedWpmClient } from '../lib/supabase/wpmClients';
import { getOwnedAgentSetup, mapAgentRecordToSetupInput, saveOwnedAgentSetup } from '../lib/supabase/wpmAgents';
import {
  AgentSetupInput,
  applyAgentTemplate,
  getAgentSetupCompletion,
  getAgentTemplate,
  listAgentTemplates,
  validateAgentSetupInput,
} from '../lib/wpm/agentSetup';

const DEFAULT_AGENT: AgentSetupInput = {
  template_key: '',
  name: '',
  public_name: '',
  tone: '',
  language: 'en',
  response_length: 'balanced',
  booking_url: '',
  handoff_contact: '',
  system_prompt: '',
  business_summary: '',
  faq_instructions: '',
  lead_qualification_instructions: '',
  handoff_rules: '',
  never_say_rules: '',
  emergency_keywords: '',
  lead_fields: '',
};

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-secondary-foreground">{label}</span>
      {children}
      {error && <span className="block text-sm text-red-400">{error}</span>}
    </label>
  );
}

export default function AgentSetup() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentSetupInput>(DEFAULT_AGENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const templates = useMemo(() => listAgentTemplates(), []);
  const selectedTemplate = useMemo(() => getAgentTemplate(agent.template_key), [agent.template_key]);
  const validationErrors = useMemo(() => validateAgentSetupInput(agent), [agent]);
  const completion = useMemo(() => getAgentSetupCompletion(agent), [agent]);

  useEffect(() => {
    let mounted = true;

    async function loadAgent() {
      try {
        setLoading(true);
        const client = await getOwnedWpmClient();

        if (!client) {
          if (mounted) {
            setError('Create your Business Profile before configuring the agent.');
          }
          return;
        }

        if (mounted) setClientId(client.id);

        const existingAgent = await getOwnedAgentSetup(client.id);
        if (mounted && existingAgent) {
          setAgent({ ...DEFAULT_AGENT, ...mapAgentRecordToSetupInput(existingAgent) });
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load agent setup.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadAgent();

    return () => {
      mounted = false;
    };
  }, []);

  const updateField = (field: keyof AgentSetupInput, value: string) => {
    setAgent((current) => ({ ...current, [field]: value }));
    setSuccess(null);
  };

  const handleTemplateChange = (templateKey: string) => {
    setAgent((current) => {
      const next = applyAgentTemplate({ ...current, template_key: templateKey }, templateKey);
      if (!next.name) {
        next.name = getAgentTemplate(templateKey)?.label ? `${getAgentTemplate(templateKey)?.label} Agent` : '';
      }
      return next;
    });
    setSuccess(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!clientId) {
      setError('Create your Business Profile before saving agent setup.');
      return;
    }

    const errors = validateAgentSetupInput(agent);
    if (Object.keys(errors).length > 0) {
      setError('Fix the highlighted fields before saving.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const savedAgent = await saveOwnedAgentSetup(agent, clientId);
      setAgent({ ...DEFAULT_AGENT, ...mapAgentRecordToSetupInput(savedAgent) });
      setSuccess('Agent setup saved. Next: load business knowledge and FAQs.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save agent setup.');
    } finally {
      setSaving(false);
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
                  <Bot className="h-4 w-4" />
                  Step 2 · Agent template and instructions
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Agent Setup</h1>
                  <p className="mt-3 text-secondary-foreground">
                    Choose the vertical template, define how the AI DM Agent speaks, qualifies leads, escalates, and books the next step.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-secondary bg-background/80 p-5 shadow-lg backdrop-blur">
                <div className="text-sm text-secondary-foreground">Agent readiness</div>
                <div className="mt-1 text-4xl font-bold">{completion.percentComplete}%</div>
                <div className="mt-2 h-2 w-56 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${completion.percentComplete}%` }} />
                </div>
                <div className="mt-3 text-sm text-secondary-foreground">
                  {completion.completed} of {completion.total} required fields complete
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

        <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-secondary bg-secondary/20 p-5 md:p-6">
            {loading ? (
              <div className="flex items-center gap-3 text-secondary-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading agent setup...
              </div>
            ) : (
              <>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Agent template" error={validationErrors.template_key}>
                    <select value={agent.template_key} onChange={(event) => handleTemplateChange(event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary">
                      <option value="">Choose template</option>
                      {templates.map((template) => (
                        <option key={template.key} value={template.key}>{template.label}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Agent name" error={validationErrors.name}>
                    <input value={agent.name} onChange={(event) => updateField('name', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="AI Receptionist" />
                  </Field>

                  <Field label="Public name">
                    <input value={agent.public_name} onChange={(event) => updateField('public_name', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="WolfPack Assistant" />
                  </Field>

                  <Field label="Tone">
                    <input value={agent.tone} onChange={(event) => updateField('tone', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="sharp, premium, direct" />
                  </Field>

                  <Field label="Language">
                    <input value={agent.language} onChange={(event) => updateField('language', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="en, es, en/es" />
                  </Field>

                  <Field label="Response length">
                    <select value={agent.response_length} onChange={(event) => updateField('response_length', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary">
                      <option value="concise">Concise</option>
                      <option value="balanced">Balanced</option>
                      <option value="detailed">Detailed</option>
                    </select>
                  </Field>

                  <Field label="Booking URL" error={validationErrors.booking_url}>
                    <input value={agent.booking_url} onChange={(event) => updateField('booking_url', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="https://example.com/book" />
                  </Field>

                  <Field label="Handoff contact">
                    <input value={agent.handoff_contact} onChange={(event) => updateField('handoff_contact', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="ops@example.com or phone" />
                  </Field>
                </div>

                <Field label="Core system instructions" error={validationErrors.system_prompt}>
                  <textarea value={agent.system_prompt} onChange={(event) => updateField('system_prompt', event.target.value)} className="min-h-28 w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" />
                </Field>

                <Field label="Business summary">
                  <textarea value={agent.business_summary} onChange={(event) => updateField('business_summary', event.target.value)} className="min-h-24 w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="What the business does, who it serves, and what outcome the DM agent should drive." />
                </Field>

                <Field label="FAQ instructions">
                  <textarea value={agent.faq_instructions} onChange={(event) => updateField('faq_instructions', event.target.value)} className="min-h-24 w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="How the agent should answer common questions before knowledge is loaded." />
                </Field>

                <Field label="Lead qualification instructions">
                  <textarea value={agent.lead_qualification_instructions} onChange={(event) => updateField('lead_qualification_instructions', event.target.value)} className="min-h-24 w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" />
                </Field>

                <Field label="Handoff rules">
                  <textarea value={agent.handoff_rules} onChange={(event) => updateField('handoff_rules', event.target.value)} className="min-h-24 w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" />
                </Field>

                <Field label="Never-say rules">
                  <textarea value={agent.never_say_rules} onChange={(event) => updateField('never_say_rules', event.target.value)} className="min-h-24 w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" />
                </Field>

                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Emergency keywords">
                    <input value={Array.isArray(agent.emergency_keywords) ? agent.emergency_keywords.join(', ') : agent.emergency_keywords} onChange={(event) => updateField('emergency_keywords', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="urgent, refund, manager" />
                  </Field>

                  <Field label="Lead fields to collect">
                    <input value={Array.isArray(agent.lead_fields) ? agent.lead_fields.join(', ') : agent.lead_fields} onChange={(event) => updateField('lead_fields', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="name, email, phone, service_interest" />
                  </Field>
                </div>

                <button type="submit" disabled={saving || !clientId} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60">
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                  Save agent setup
                </button>
              </>
            )}
          </form>

          <aside className="space-y-4 rounded-2xl border border-secondary bg-secondary/20 p-5">
            <h2 className="text-xl font-semibold">Template preview</h2>
            {selectedTemplate ? (
              <div className="space-y-3 rounded-xl bg-background/70 p-4 text-sm text-secondary-foreground">
                <div className="flex items-center gap-2 text-primary"><Wand2 className="h-4 w-4" /> {selectedTemplate.label}</div>
                <p>{selectedTemplate.description}</p>
                <p><span className="font-semibold text-foreground">Lead fields:</span> {selectedTemplate.leadFields.join(', ')}</p>
              </div>
            ) : (
              <div className="rounded-xl bg-background/70 p-4 text-sm text-secondary-foreground">Choose a template to auto-fill the core operating rules.</div>
            )}

            <h2 className="text-xl font-semibold">Launch blockers</h2>
            {completion.ready ? (
              <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-primary">Agent setup is ready for knowledge loading.</div>
            ) : (
              <ul className="space-y-2 text-sm text-secondary-foreground">
                {completion.blockers.map((blocker) => <li key={blocker} className="rounded-lg bg-background/70 p-3">{blocker}</li>)}
              </ul>
            )}
          </aside>
        </section>
      </div>
    </div>
  );
}
