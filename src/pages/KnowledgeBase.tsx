import React, { useState, useEffect } from 'react';
import { BookOpenText, Plus, Trash2, AlertCircle, Loader2, Info } from 'lucide-react';
import {
  getOwnedWpmClient,
  listKnowledgeSources,
  createKnowledgeSource,
  deleteKnowledgeSource,
} from '../lib/supabase/wpmClients';

type UiType = 'faq' | 'service' | 'policy' | 'url' | 'other';

interface KnowledgeSource {
  id: string;
  type: UiType;
  title: string;
  content_text: string;
  source_url: string | null;
  tags: string;
}

const typeLabels: Record<UiType, string> = {
  faq: 'FAQ',
  service: 'Service / Offering',
  policy: 'Policy',
  url: 'Website page',
  other: 'Other',
};

/**
 * The agent reads the most recently updated sources up to this many — see the
 * knowledge query in supabase/functions/_shared/wpm_ai.ts. Beyond it, older
 * sources stop reaching the prompt, so the page says so rather than letting
 * knowledge go quietly unused.
 */
const SOURCES_USED_BY_AGENT = 8;

function isUiType(value: unknown): value is UiType {
  return typeof value === 'string' && value in typeLabels;
}

export default function KnowledgeBase() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [newSource, setNewSource] = useState<{
    type: UiType;
    title: string;
    content_text: string;
    source_url: string;
    tags: string;
  }>({ type: 'faq', title: '', content_text: '', source_url: '', tags: '' });

  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    async function loadKnowledge() {
      setLoading(true);
      setError(null);
      try {
        const client = await getOwnedWpmClient();
        setClientId(client?.id ?? null);

        const isDemo = !client || client.id.startsWith('demo') || !client.id.includes('-');
        setIsDemoMode(isDemo);

        if (client && !isDemo) {
          const rows = await listKnowledgeSources(client.id);
          setSources(
            rows.map((row: any) => ({
              id: row.id,
              type: isUiType(row.metadata?.ui_type) ? row.metadata.ui_type : 'other',
              title: row.title,
              content_text: row.content_text || '',
              source_url: row.source_url ?? null,
              tags: (row.metadata?.tags || []).join(', '),
            })),
          );
        }
      } catch (err) {
        console.error('Failed to load knowledge base', err);
        setError('Could not load your knowledge base. Refresh the page to try again.');
      } finally {
        setLoading(false);
      }
    }
    loadKnowledge();
  }, []);

  const canSubmit =
    newSource.title.trim() !== '' &&
    newSource.content_text.trim() !== '' &&
    (newSource.type !== 'url' || newSource.source_url.trim() !== '');

  const addSource = async () => {
    if (!canSubmit || !clientId || isDemoMode) return;
    setAdding(true);
    setError(null);
    try {
      const created = await createKnowledgeSource(clientId, {
        title: newSource.title.trim(),
        content_text: newSource.content_text.trim(),
        ui_type: newSource.type,
        source_url: newSource.type === 'url' ? newSource.source_url.trim() : null,
        tags: newSource.tags,
      });

      // Uses the id the database assigned, so delete can actually find it.
      setSources((current) => [
        {
          id: created.id,
          type: newSource.type,
          title: created.title,
          content_text: created.content_text || '',
          source_url: created.source_url ?? null,
          tags: newSource.tags,
        },
        ...current,
      ]);
      setNewSource({ type: 'faq', title: '', content_text: '', source_url: '', tags: '' });
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not save that source: ${err.message}`
          : 'Could not save that source.',
      );
    } finally {
      setAdding(false);
    }
  };

  const deleteSource = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      await deleteKnowledgeSource(id);
      setSources((current) => current.filter((source) => source.id !== id));
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not delete that source: ${err.message}`
          : 'Could not delete that source.',
      );
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-5xl flex items-center gap-2 justify-center min-h-[300px] text-secondary-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading knowledge base…
      </div>
    );
  }

  const inputClass =
    'w-full rounded-lg border border-secondary bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50';

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <BookOpenText className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-semibold">Knowledge Base</h1>
        </div>
        <p className="text-secondary-foreground">
          What your agent knows about your business. It answers only from this, so anything missing
          becomes “let me have someone follow up”.
        </p>
        {isDemoMode && (
          <div className="mt-3 flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4" />
            Set up your Business Profile first — knowledge is saved against your business.
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Add a source */}
      <div className="bg-secondary/30 border border-secondary rounded-2xl p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="h-5 w-5" />
          <h3 className="font-medium">Add knowledge</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-secondary-foreground mb-1 block" htmlFor="kb-type">
              Type
            </label>
            <select
              id="kb-type"
              value={newSource.type}
              onChange={(e) => setNewSource({ ...newSource, type: e.target.value as UiType })}
              className={inputClass}
            >
              {Object.entries(typeLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-secondary-foreground mb-1 block" htmlFor="kb-title">
              Title
            </label>
            <input
              id="kb-title"
              type="text"
              value={newSource.title}
              onChange={(e) => setNewSource({ ...newSource, title: e.target.value })}
              placeholder="e.g. Pricing for website projects"
              className={inputClass}
            />
          </div>
        </div>

        {newSource.type === 'url' && (
          <div className="mb-4">
            <label className="text-xs text-secondary-foreground mb-1 block" htmlFor="kb-url">
              Page address
            </label>
            <input
              id="kb-url"
              type="url"
              value={newSource.source_url}
              onChange={(e) => setNewSource({ ...newSource, source_url: e.target.value })}
              placeholder="https://example.com/pricing"
              className={inputClass}
            />
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-secondary-foreground">
              <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              We don’t read the page automatically yet — paste the text you want the agent to know
              into Content below. The address is kept so you know where it came from.
            </p>
          </div>
        )}

        <div className="mb-4">
          <label className="text-xs text-secondary-foreground mb-1 block" htmlFor="kb-content">
            Content
          </label>
          <textarea
            id="kb-content"
            value={newSource.content_text}
            onChange={(e) => setNewSource({ ...newSource, content_text: e.target.value })}
            rows={4}
            placeholder="Exactly what you'd want a new employee to know about this."
            className={inputClass}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={newSource.tags}
            onChange={(e) => setNewSource({ ...newSource, tags: e.target.value })}
            placeholder="Tags (comma separated)"
            className={`${inputClass} flex-1 min-w-[12rem]`}
            aria-label="Tags"
          />
          <button
            onClick={addSource}
            disabled={!canSubmit || adding || isDemoMode}
            className="inline-flex items-center gap-2 px-6 py-2 rounded-xl bg-primary text-white font-medium transition-colors hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {adding && <Loader2 className="h-4 w-4 animate-spin" />}
            {adding ? 'Adding…' : 'Add source'}
          </button>
        </div>
      </div>

      {/* Existing sources */}
      <div className="mb-4">
        <h3 className="font-medium">Your knowledge ({sources.length})</h3>
        <p className="text-xs text-secondary-foreground mt-1">
          Saved automatically. Your agent uses the {SOURCES_USED_BY_AGENT} most recently updated
          sources.
        </p>
      </div>

      {sources.length > SOURCES_USED_BY_AGENT && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            You have {sources.length} sources but your agent reads {SOURCES_USED_BY_AGENT}. The{' '}
            {sources.length - SOURCES_USED_BY_AGENT} least recently updated are not being used —
            combine related ones so nothing is lost.
          </span>
        </div>
      )}

      {sources.length === 0 && (
        <div className="text-center py-12 text-secondary-foreground border border-dashed border-secondary rounded-2xl">
          Nothing added yet. Your agent currently has no information about your business — start with
          your services and prices.
        </div>
      )}

      <div className="space-y-4">
        {sources.map((source, index) => {
          const unused = index >= SOURCES_USED_BY_AGENT;
          return (
            <div
              key={source.id}
              className="bg-secondary/20 border border-secondary rounded-xl p-5"
            >
              <div className="flex justify-between items-start mb-3 gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                      {typeLabels[source.type]}
                    </span>
                    <h4 className="font-medium">{source.title}</h4>
                    {unused && (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
                        Not in use
                      </span>
                    )}
                  </div>
                  {source.source_url && (
                    <a
                      href={source.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline mt-1 inline-block break-all"
                    >
                      {source.source_url}
                    </a>
                  )}
                  {source.tags && (
                    <div className="text-xs text-secondary-foreground mt-1">{source.tags}</div>
                  )}
                </div>
                <button
                  onClick={() => deleteSource(source.id)}
                  disabled={deletingId === source.id}
                  className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg disabled:opacity-50 flex-shrink-0"
                  aria-label={`Delete ${source.title}`}
                >
                  {deletingId === source.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-sm whitespace-pre-wrap text-secondary-foreground">
                {source.content_text}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
