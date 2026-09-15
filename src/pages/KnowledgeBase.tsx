import { useState, useEffect, useMemo } from 'react';
import { BookOpenText, Plus, Trash2, AlertCircle, Loader2, Info, Pencil, Check, X } from 'lucide-react';
import {
  getOwnedWpmClient,
  listKnowledgeSources,
  createKnowledgeSource,
  updateKnowledgeSource,
  deleteKnowledgeSource,
  listBotProfiles,
  setKnowledgeSourceAgent,
  type KnowledgeSource as KnowledgeRow,
} from '../lib/supabase/wpmClients';
import {
  computeKnowledgeUsage,
  MAX_CHARS_PER_SOURCE,
  MAX_CHARS_TOTAL,
  SOURCES_READ_PER_AGENT,
} from '../lib/knowledgeUsage';

type UiType = 'faq' | 'service' | 'policy' | 'url' | 'other';

interface KnowledgeSource {
  id: string;
  type: UiType;
  title: string;
  content_text: string;
  source_url: string | null;
  tags: string;
  /** null = shared with every agent on the account. */
  bot_profile_id: string | null;
  updated_at: string;
  status: string;
}

interface AgentOption {
  id: string;
  name: string;
}

/** The fields a person types — shared by the Add form and the Edit form. */
interface Draft {
  type: UiType;
  title: string;
  content_text: string;
  source_url: string;
  tags: string;
}

const EMPTY_DRAFT: Draft = { type: 'faq', title: '', content_text: '', source_url: '', tags: '' };

/** The value the <select> uses for "every agent" — <option> cannot carry null. */
const ALL_AGENTS = '';

/**
 * The Add form's "Used by" before anyone has chosen. Only used when the account
 * has more than one agent.
 *
 * Adding used to save every source as "every agent" with no way to say
 * otherwise, so knowledge for a second business (Skywake Aviation on the
 * WolfPack account) reached every other agent's prompt until someone noticed
 * and changed it. With several agents, the choice is now required up front.
 */
const UNCHOSEN = '__unchosen__';

const typeLabels: Record<UiType, string> = {
  faq: 'FAQ',
  service: 'Service / Offering',
  policy: 'Policy',
  url: 'Website page',
  other: 'Other',
};

function isUiType(value: unknown): value is UiType {
  return typeof value === 'string' && value in typeLabels;
}

function toSource(row: KnowledgeRow, tagsFallback = ''): KnowledgeSource {
  return {
    id: row.id,
    type: isUiType(row.metadata?.ui_type) ? row.metadata.ui_type : 'other',
    title: row.title,
    content_text: row.content_text || '',
    source_url: row.source_url ?? null,
    tags: Array.isArray(row.metadata?.tags) ? row.metadata.tags.join(', ') : tagsFallback,
    bot_profile_id: row.bot_profile_id ?? null,
    updated_at: row.updated_at ?? new Date().toISOString(),
    status: row.status ?? 'ready',
  };
}

function timeOf(value: string): number {
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

/** Newest updated first — the order the agent reads in. */
function sortByUpdated(list: KnowledgeSource[]): KnowledgeSource[] {
  return [...list].sort((a, b) => timeOf(b.updated_at) - timeOf(a.updated_at));
}

function isDraftValid(draft: Draft): boolean {
  return (
    draft.title.trim() !== '' &&
    draft.content_text.trim() !== '' &&
    (draft.type !== 'url' || draft.source_url.trim() !== '')
  );
}

/** Live character count under a content box, saying when the agent stops reading. */
function CharCount({ text }: { text: string }) {
  const length = text.trim().length;
  const over = length > MAX_CHARS_PER_SOURCE;
  return (
    <p className={`mt-1 text-xs ${over ? 'text-amber-400' : 'text-secondary-foreground'}`}>
      {length.toLocaleString()} characters
      {over &&
        ` — the agent reads about the first ${MAX_CHARS_PER_SOURCE.toLocaleString()}. Split this into focused sources so the important parts are always read.`}
    </p>
  );
}

export default function KnowledgeBase() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [newSource, setNewSource] = useState<Draft>(EMPTY_DRAFT);
  const [newAgent, setNewAgent] = useState<string>(ALL_AGENTS);

  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [savingAgentFor, setSavingAgentFor] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [savingEdit, setSavingEdit] = useState(false);

  const multipleAgents = agents.length > 1;

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
          const [rows, profiles] = await Promise.all([
            listKnowledgeSources(client.id),
            listBotProfiles(client.id),
          ]);
          const options = profiles.map((p) => ({ id: p.id, name: p.name }));
          setAgents(options);
          setNewAgent(options.length > 1 ? UNCHOSEN : ALL_AGENTS);
          setSources(sortByUpdated(rows.map((row) => toSource(row))));
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

  /** What each agent actually reads, mirrored from the edge functions. */
  const usage = useMemo(
    () =>
      computeKnowledgeUsage(
        sources.map((s) => ({
          id: s.id,
          bot_profile_id: s.bot_profile_id,
          updated_at: s.updated_at,
          content_text: s.content_text,
          status: s.status,
        })),
        agents.map((a) => a.id),
      ),
    [sources, agents],
  );

  const notReadCount = sources.filter((s) => (usage.get(s.id)?.readBy.length ?? 0) === 0).length;

  const canSubmit = isDraftValid(newSource) && (!multipleAgents || newAgent !== UNCHOSEN);

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
        bot_profile_id: multipleAgents && newAgent !== ALL_AGENTS && newAgent !== UNCHOSEN ? newAgent : null,
      });

      // Uses the id the database assigned, so edit and delete can find it.
      setSources((current) => sortByUpdated([toSource(created, newSource.tags), ...current]));
      setNewSource(EMPTY_DRAFT);
      setNewAgent(multipleAgents ? UNCHOSEN : ALL_AGENTS);
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

  const startEdit = (source: KnowledgeSource) => {
    setError(null);
    setEditingId(source.id);
    setEditDraft({
      type: source.type,
      title: source.title,
      content_text: source.content_text,
      source_url: source.source_url ?? '',
      tags: source.tags,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(EMPTY_DRAFT);
  };

  const saveEdit = async () => {
    if (!editingId || !isDraftValid(editDraft) || isDemoMode) return;
    setSavingEdit(true);
    setError(null);
    try {
      const updated = await updateKnowledgeSource(editingId, {
        title: editDraft.title.trim(),
        content_text: editDraft.content_text.trim(),
        ui_type: editDraft.type,
        source_url: editDraft.type === 'url' ? editDraft.source_url.trim() : null,
        tags: editDraft.tags,
      });
      setSources((current) =>
        sortByUpdated(current.map((s) => (s.id === editingId ? toSource(updated, editDraft.tags) : s))),
      );
      cancelEdit();
    } catch (err) {
      // The draft stays open so nothing typed is lost.
      setError(
        err instanceof Error
          ? `Could not save your changes: ${err.message}`
          : 'Could not save your changes.',
      );
    } finally {
      setSavingEdit(false);
    }
  };

  /**
   * Reassign a source to one agent, or back to every agent.
   *
   * Optimistic, then reverted on failure: a select that snaps back is honest
   * about not having saved, whereas one that stays put would quietly claim a
   * scoping change that never reached the database.
   */
  const changeSourceAgent = async (id: string, value: string) => {
    const botProfileId = value === ALL_AGENTS ? null : value;
    const previous = sources.find((s) => s.id === id)?.bot_profile_id ?? null;
    if (previous === botProfileId) return;

    setSavingAgentFor(id);
    setError(null);
    setSources((current) =>
      current.map((s) => (s.id === id ? { ...s, bot_profile_id: botProfileId } : s)),
    );
    try {
      await setKnowledgeSourceAgent(id, botProfileId);
      // The update trigger bumped updated_at, which moves this source to the
      // front of what its agents read. Reflect that without a reload.
      const now = new Date().toISOString();
      setSources((current) =>
        sortByUpdated(current.map((s) => (s.id === id ? { ...s, updated_at: now } : s))),
      );
    } catch (err) {
      console.error('Failed to change knowledge source agent', err);
      setSources((current) =>
        current.map((s) => (s.id === id ? { ...s, bot_profile_id: previous } : s)),
      );
      setError('Could not change which agent uses that source. Please try again.');
    } finally {
      setSavingAgentFor(null);
    }
  };

  const deleteSource = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      await deleteKnowledgeSource(id);
      setSources((current) => current.filter((source) => source.id !== id));
      if (editingId === id) cancelEdit();
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

  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.name ?? 'an inactive agent';

  /** The fields shared by Add and Edit. `idPrefix` keeps label/input ids unique. */
  const renderDraftFields = (draft: Draft, setDraft: (d: Draft) => void, idPrefix: string, rows: number) => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-xs text-secondary-foreground mb-1 block" htmlFor={`${idPrefix}-type`}>
            Type
          </label>
          <select
            id={`${idPrefix}-type`}
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value as UiType })}
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
          <label className="text-xs text-secondary-foreground mb-1 block" htmlFor={`${idPrefix}-title`}>
            Title
          </label>
          <input
            id={`${idPrefix}-title`}
            type="text"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="e.g. Pricing for website projects"
            className={inputClass}
          />
        </div>
      </div>

      {draft.type === 'url' && (
        <div className="mb-4">
          <label className="text-xs text-secondary-foreground mb-1 block" htmlFor={`${idPrefix}-url`}>
            Page address
          </label>
          <input
            id={`${idPrefix}-url`}
            type="url"
            value={draft.source_url}
            onChange={(e) => setDraft({ ...draft, source_url: e.target.value })}
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
        <label className="text-xs text-secondary-foreground mb-1 block" htmlFor={`${idPrefix}-content`}>
          Content
        </label>
        <textarea
          id={`${idPrefix}-content`}
          value={draft.content_text}
          onChange={(e) => setDraft({ ...draft, content_text: e.target.value })}
          rows={rows}
          placeholder="Exactly what you'd want a new employee to know about this."
          className={inputClass}
        />
        <CharCount text={draft.content_text} />
      </div>
    </>
  );

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

        {renderDraftFields(newSource, setNewSource, 'kb', 4)}

        {multipleAgents && (
          <div className="mb-4">
            <label className="text-xs text-secondary-foreground mb-1 block" htmlFor="kb-agent">
              Used by
            </label>
            <select
              id="kb-agent"
              value={newAgent}
              onChange={(e) => setNewAgent(e.target.value)}
              className={inputClass}
            >
              <option value={UNCHOSEN} disabled>
                Choose which agent uses this…
              </option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} only
                </option>
              ))}
              <option value={ALL_AGENTS}>Every agent</option>
            </select>
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-secondary-foreground">
              <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              “Every agent” shares this with all {agents.length} agents on this account. Choose one
              agent for anything that belongs to a single business.
            </p>
          </div>
        )}

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
          Saved automatically, newest updated first. Each agent reads its{' '}
          {SOURCES_READ_PER_AGENT} most recently updated sources — up to{' '}
          {MAX_CHARS_PER_SOURCE.toLocaleString()} characters from each and{' '}
          {MAX_CHARS_TOTAL.toLocaleString()} in total.
        </p>
      </div>

      {notReadCount > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            {notReadCount} {notReadCount === 1 ? 'source is' : 'sources are'} not read by any
            agent — each agent reads only its {SOURCES_READ_PER_AGENT} most recently updated
            sources and {MAX_CHARS_TOTAL.toLocaleString()} characters in total. Combine or shorten
            related sources so nothing is lost.
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
        {sources.map((source) => {
          const sourceUsage = usage.get(source.id);
          const notRead = (sourceUsage?.readBy.length ?? 0) === 0;
          const totalChars = sourceUsage?.totalChars ?? source.content_text.length;
          const partlyRead = !notRead && (sourceUsage?.charsRead ?? 0) < totalChars;
          const isEditing = editingId === source.id;

          if (isEditing) {
            return (
              <div key={source.id} className="bg-secondary/30 border border-primary/40 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Pencil className="h-4 w-4" />
                  <h4 className="font-medium">Edit knowledge</h4>
                </div>
                {renderDraftFields(editDraft, setEditDraft, `edit-${source.id}`, 10)}
                <input
                  type="text"
                  value={editDraft.tags}
                  onChange={(e) => setEditDraft({ ...editDraft, tags: e.target.value })}
                  placeholder="Tags (comma separated)"
                  className={`${inputClass} mb-4`}
                  aria-label="Tags"
                />
                {multipleAgents && (
                  <p className="mb-4 text-xs text-secondary-foreground">
                    Used by{' '}
                    <strong>{source.bot_profile_id ? `${agentName(source.bot_profile_id)} only` : 'every agent'}</strong>
                    . Editing does not change this.
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={saveEdit}
                    disabled={!isDraftValid(editDraft) || savingEdit || isDemoMode}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white font-medium transition-colors hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {savingEdit ? 'Saving…' : 'Save changes'}
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={savingEdit}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl border border-secondary text-secondary-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                </div>
              </div>
            );
          }

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
                    {notRead && (
                      <span
                        className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400"
                        title={`No agent reads this. Each agent reads only its ${SOURCES_READ_PER_AGENT} most recently updated sources and ${MAX_CHARS_TOTAL.toLocaleString()} characters in total — or it is assigned to an agent that is switched off.`}
                      >
                        Not in use
                      </span>
                    )}
                    {partlyRead && (
                      <span
                        className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400"
                        title={`The agent reads the first ${(sourceUsage?.charsRead ?? 0).toLocaleString()} characters and offers to have someone follow up on the rest. Split it into focused sources so the important parts are always read.`}
                      >
                        Agent reads {(sourceUsage?.charsRead ?? 0).toLocaleString()} of{' '}
                        {totalChars.toLocaleString()} characters
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
                  {multipleAgents && (
                    <div className="flex items-center gap-2 mt-2">
                      <label
                        htmlFor={`agent-${source.id}`}
                        className="text-xs text-secondary-foreground"
                      >
                        Used by
                      </label>
                      <select
                        id={`agent-${source.id}`}
                        value={source.bot_profile_id ?? ALL_AGENTS}
                        onChange={(e) => changeSourceAgent(source.id, e.target.value)}
                        disabled={savingAgentFor === source.id}
                        className="text-xs bg-secondary border border-secondary rounded px-2 py-1 disabled:opacity-50"
                      >
                        <option value={ALL_AGENTS}>Every agent</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name} only
                          </option>
                        ))}
                      </select>
                      {savingAgentFor === source.id && (
                        <Loader2 className="h-3 w-3 animate-spin text-secondary-foreground" />
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => startEdit(source)}
                    disabled={editingId !== null || deletingId === source.id || isDemoMode}
                    className="p-2 text-secondary-foreground hover:text-foreground hover:bg-secondary rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label={`Edit ${source.title}`}
                    title={editingId !== null ? 'Finish the edit you have open first' : 'Edit'}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteSource(source.id)}
                    disabled={deletingId === source.id}
                    className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg disabled:opacity-50"
                    aria-label={`Delete ${source.title}`}
                  >
                    {deletingId === source.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
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
