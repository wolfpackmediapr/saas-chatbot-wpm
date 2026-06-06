import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { BookOpenText, CheckCircle2, Edit3, Loader2, Plus, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { getOwnedAgentSetup } from '../lib/supabase/wpmAgents';
import { getOwnedWpmClient } from '../lib/supabase/wpmClients';
import {
  archiveOwnedKnowledgeSource,
  listOwnedKnowledgeSources,
  mapKnowledgeRecordToInput,
  saveOwnedKnowledgeSource,
  WpmKnowledgeSourceRecord,
} from '../lib/supabase/wpmKnowledge';
import {
  getKnowledgeCompletion,
  getKnowledgeSourceTypeLabel,
  KnowledgePriority,
  KnowledgeSourceInput,
  KnowledgeSourceType,
  validateKnowledgeSourceInput,
} from '../lib/wpm/knowledgeSetup';

const DEFAULT_SOURCE: KnowledgeSourceInput = {
  source_type: 'faq',
  title: '',
  source_url: '',
  content_text: '',
  tags: '',
  audience: '',
  priority: 'normal',
};

const SOURCE_TYPES: KnowledgeSourceType[] = ['faq', 'manual', 'url', 'file', 'notion', 'google_doc'];
const PRIORITIES: KnowledgePriority[] = ['normal', 'high', 'low'];

function Field({
  label,
  children,
  error,
  help,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  help?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-secondary-foreground">{label}</span>
      {children}
      {help && <span className="block text-xs text-secondary-foreground">{help}</span>}
      {error && <span className="block text-sm text-red-400">{error}</span>}
    </label>
  );
}

function statusBadgeClass(status: WpmKnowledgeSourceRecord['status']): string {
  if (status === 'ready') return 'border-primary/30 bg-primary/10 text-primary';
  if (status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-300';
  return 'border-secondary bg-secondary/60 text-secondary-foreground';
}

export default function KnowledgeBase() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [botProfileId, setBotProfileId] = useState<string | null>(null);
  const [sources, setSources] = useState<WpmKnowledgeSourceRecord[]>([]);
  const [source, setSource] = useState<KnowledgeSourceInput>(DEFAULT_SOURCE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const validationErrors = useMemo(() => validateKnowledgeSourceInput(source), [source]);
  const completion = useMemo(() => getKnowledgeCompletion(sources), [sources]);

  useEffect(() => {
    let mounted = true;

    async function loadKnowledge() {
      try {
        setLoading(true);
        const client = await getOwnedWpmClient();

        if (!client) {
          if (mounted) setError('Create your Business Profile before loading knowledge.');
          return;
        }

        const agent = await getOwnedAgentSetup(client.id);
        const knowledgeSources = await listOwnedKnowledgeSources(client.id);

        if (mounted) {
          setClientId(client.id);
          setBotProfileId(agent?.profile.id ?? null);
          setSources(knowledgeSources);
          if (!agent?.profile.id) {
            setError('Agent Setup is not complete yet. You can draft knowledge now, but connect it to an agent after Step 2.');
          }
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load knowledge sources.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadKnowledge();

    return () => {
      mounted = false;
    };
  }, []);

  const updateField = (field: keyof KnowledgeSourceInput, value: string) => {
    setSource((current) => ({ ...current, [field]: value }));
    setSuccess(null);
  };

  const reloadSources = async (ownedClientId: string) => {
    const nextSources = await listOwnedKnowledgeSources(ownedClientId);
    setSources(nextSources);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!clientId) {
      setError('Create your Business Profile before saving knowledge.');
      return;
    }

    const errors = validateKnowledgeSourceInput(source);
    if (Object.keys(errors).length > 0) {
      setError('Fix the highlighted fields before saving.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await saveOwnedKnowledgeSource(source, clientId, botProfileId);
      await reloadSources(clientId);
      setSource(DEFAULT_SOURCE);
      setSuccess('Knowledge source saved. Add another FAQ, service block, pricing note, policy, or URL.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save knowledge source.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (record: WpmKnowledgeSourceRecord) => {
    setSource({ ...DEFAULT_SOURCE, ...mapKnowledgeRecordToInput(record) });
    setSuccess(null);
  };

  const handleArchive = async (record: WpmKnowledgeSourceRecord) => {
    if (!clientId) return;

    try {
      setError(null);
      await archiveOwnedKnowledgeSource(record.id, clientId);
      await reloadSources(clientId);
      if (source.id === record.id) setSource(DEFAULT_SOURCE);
      setSuccess('Knowledge source archived.');
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Failed to archive knowledge source.');
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
                  <BookOpenText className="h-4 w-4" />
                  Step 3 · Knowledge base
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Knowledge Base</h1>
                  <p className="mt-3 text-secondary-foreground">
                    Load FAQs, services, prices, policies, and trusted links so the AI DM Agent answers from client-specific facts instead of guessing.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-secondary bg-background/80 p-5 shadow-lg backdrop-blur">
                <div className="text-sm text-secondary-foreground">Knowledge readiness</div>
                <div className="mt-1 text-4xl font-bold">{completion.percentComplete}%</div>
                <div className="mt-2 h-2 w-56 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${completion.percentComplete}%` }} />
                </div>
                <div className="mt-3 text-sm text-secondary-foreground">
                  {completion.readyCount} ready · {completion.totalCount} total sources
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
                Loading knowledge base...
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">{source.id ? 'Edit knowledge source' : 'Add knowledge source'}</h2>
                  {source.id && (
                    <button type="button" onClick={() => setSource(DEFAULT_SOURCE)} className="inline-flex items-center gap-2 rounded-lg border border-secondary px-3 py-2 text-sm hover:bg-secondary">
                      <Plus className="h-4 w-4" />
                      New source
                    </button>
                  )}
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Source type" error={validationErrors.source_type}>
                    <select value={source.source_type} onChange={(event) => updateField('source_type', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary">
                      {SOURCE_TYPES.map((type) => (
                        <option key={type} value={type}>{getKnowledgeSourceTypeLabel(type)}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Title" error={validationErrors.title}>
                    <input value={source.title} onChange={(event) => updateField('title', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="Services, pricing, booking policy, menu FAQ" />
                  </Field>

                  <Field label="Source URL" error={validationErrors.source_url} help="Optional for manual/FAQ. Required when this source is only a webpage.">
                    <input value={source.source_url} onChange={(event) => updateField('source_url', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="https://example.com/services" />
                  </Field>

                  <Field label="Priority">
                    <select value={source.priority} onChange={(event) => updateField('priority', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary">
                      {PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>{priority}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Audience">
                    <input value={source.audience} onChange={(event) => updateField('audience', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="prospects, customers, VIP, support" />
                  </Field>

                  <Field label="Tags">
                    <input value={source.tags} onChange={(event) => updateField('tags', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="pricing, services, policy" />
                  </Field>
                </div>

                <Field label="Knowledge content" error={validationErrors.content_text} help="Paste direct facts. The bridge will use this as the trusted answer base.">
                  <textarea value={source.content_text} onChange={(event) => updateField('content_text', event.target.value)} className="min-h-56 w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder={`Example:\nQ: How do I book?\nA: Use the booking link or send name, phone, desired date, and service.\n\nServices:\n- Strategy call: ...\n- Monthly retainer: ...\n\nPolicies:\n- Deposits are required for ...`} />
                </Field>

                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {source.id ? 'Update knowledge source' : 'Save knowledge source'}
                </button>
              </>
            )}
          </form>

          <aside className="space-y-5">
            <div className="rounded-2xl border border-secondary bg-secondary/20 p-5">
              <h2 className="font-semibold">Launch blockers</h2>
              {completion.blockers.length === 0 ? (
                <p className="mt-3 text-sm text-primary">Knowledge base is ready for the test conversation step.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm text-secondary-foreground">
                  {completion.blockers.map((blocker) => (
                    <li key={blocker}>• {blocker}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-secondary bg-secondary/20 p-5">
              <h2 className="font-semibold">Recommended minimum</h2>
              <ul className="mt-3 space-y-2 text-sm text-secondary-foreground">
                <li>• 5-10 FAQs the client gets every week.</li>
                <li>• Service/pricing overview with clear boundaries.</li>
                <li>• Booking, refund, cancellation, and response-time policies.</li>
                <li>• Website/service URL for source-of-truth references.</li>
              </ul>
            </div>
          </aside>
        </section>

        <section className="rounded-2xl border border-secondary bg-secondary/20 p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Saved sources</h2>
            <span className="text-sm text-secondary-foreground">{sources.length} active</span>
          </div>

          {sources.length === 0 ? (
            <p className="mt-4 text-secondary-foreground">No knowledge sources yet. Add the first FAQ, service block, policy, or URL above.</p>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {sources.map((record) => (
                <article key={record.id} className="rounded-xl border border-secondary bg-background/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-secondary-foreground">{getKnowledgeSourceTypeLabel(record.source_type)}</div>
                      <h3 className="mt-1 font-semibold">{record.title}</h3>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-xs ${statusBadgeClass(record.status)}`}>{record.status}</span>
                  </div>

                  {record.source_url && <p className="mt-2 truncate text-sm text-primary">{record.source_url}</p>}
                  {record.content_text && <p className="mt-3 line-clamp-3 text-sm text-secondary-foreground">{record.content_text}</p>}

                  <div className="mt-4 flex gap-2">
                    <button type="button" onClick={() => handleEdit(record)} className="inline-flex items-center gap-2 rounded-lg border border-secondary px-3 py-2 text-sm hover:bg-secondary">
                      <Edit3 className="h-4 w-4" />
                      Edit
                    </button>
                    <button type="button" onClick={() => handleArchive(record)} className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10">
                      <Trash2 className="h-4 w-4" />
                      Archive
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
