import React, { useState, useEffect } from 'react';
import { BookOpenText, Plus, Trash2, Save, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { 
  getOwnedWpmClient, 
  listKnowledgeSources, 
  createKnowledgeSource, 
  deleteKnowledgeSource 
} from '../lib/supabase/wpmClients';

interface KnowledgeSource {
  id: string;
  type: 'faq' | 'service' | 'policy' | 'url' | 'other';
  title: string;
  content_text: string;
  tags: string;
}

const typeLabels = {
  faq: 'FAQ',
  service: 'Service / Offering',
  policy: 'Policy',
  url: 'Website / URL',
  other: 'Other',
};

const uiTypeToSchema: Record<string, string> = {
  faq: 'faq',
  service: 'manual',
  policy: 'manual',
  url: 'url',
  other: 'manual',
};

export default function KnowledgeBase() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [newSource, setNewSource] = useState<Partial<KnowledgeSource>>({
    type: 'faq',
    title: '',
    content_text: '',
    tags: '',
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    async function loadKnowledge() {
      setLoading(true);
      setError(null);

      try {
        const client = await getOwnedWpmClient();
        setClientId(client?.id || null);

        const isDemo = !client || client.id.startsWith('demo') || !client.id.includes('-');
        setIsDemoMode(isDemo);

        if (client && !isDemo) {
          const dbSources = await listKnowledgeSources(client.id);

          const loaded: KnowledgeSource[] = dbSources.map((db: any) => ({
            id: db.id,
            type: (db.metadata?.ui_type as any) || reverseMapType(db.source_type),
            title: db.title,
            content_text: db.content_text || '',
            tags: (db.metadata?.tags || []).join(', '),
          }));

          setSources(loaded);
        } else {
          // Demo / local fallback
          const saved = localStorage.getItem('wpm-knowledge-base');
          if (saved) {
            setSources(JSON.parse(saved));
          }
        }
      } catch (err: any) {
        console.error('Failed to load knowledge base', err);
        setError('Could not load from database. Using local data.');
        const saved = localStorage.getItem('wpm-knowledge-base');
        if (saved) setSources(JSON.parse(saved));
        setIsDemoMode(true);
      } finally {
        setLoading(false);
      }
    }

    loadKnowledge();
  }, []);

  function reverseMapType(schemaType: string): 'faq' | 'service' | 'policy' | 'url' | 'other' {
    if (schemaType === 'faq') return 'faq';
    if (schemaType === 'url') return 'url';
    return 'other';
  }

  const saveToLocal = (updated: KnowledgeSource[]) => {
    localStorage.setItem('wpm-knowledge-base', JSON.stringify(updated));
  };

  const addSource = async () => {
    if (!newSource.title || !newSource.content_text) return;

    const uiType = newSource.type as any;
    const schemaType = uiTypeToSchema[uiType] || 'manual';

    const sourceForUI: KnowledgeSource = {
      id: Date.now().toString(36),
      type: uiType,
      title: newSource.title,
      content_text: newSource.content_text,
      tags: newSource.tags || '',
    };

    // Optimistic update
    const updated = [...sources, sourceForUI];
    setSources(updated);
    saveToLocal(updated);

    // Try real DB
    if (clientId && !isDemoMode) {
      try {
        await createKnowledgeSource(clientId, {
          title: newSource.title,
          content_text: newSource.content_text,
          source_type: schemaType,
          source_url: uiType === 'url' ? newSource.title : null,
          tags: newSource.tags,
          bot_profile_id: null, // can link later if needed
        });
      } catch (err: any) {
        console.error('Failed to save knowledge source to DB', err);
        setError('Saved locally. Failed to persist to Supabase: ' + err.message);
      }
    }

    setNewSource({ type: 'faq', title: '', content_text: '', tags: '' });
  };

  const deleteSource = async (id: string) => {
    const updated = sources.filter(s => s.id !== id);
    setSources(updated);
    saveToLocal(updated);

    if (clientId && !isDemoMode) {
      try {
        await deleteKnowledgeSource(id);
      } catch (err: any) {
        console.error('Failed to delete from DB', err);
        setError('Deleted locally. DB delete may have failed.');
      }
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    // In real flow this could trigger re-processing or just ensure status=ready
    // For now we set 'ready' on insert, so this is mostly a no-op + local refresh
    await new Promise(r => setTimeout(r, 400));
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-6 max-w-5xl flex items-center justify-center min-h-[300px]">
        <div className="text-secondary-foreground">Loading knowledge base...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <BookOpenText className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-semibold">Knowledge Base</h1>
        </div>
        <p className="text-secondary-foreground">
          Add the information your AI needs to answer accurately. The more specific, the better the replies.
        </p>
        {isDemoMode && (
          <div className="mt-3 flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4" />
            Demo mode — changes saved locally. Complete Business Profile to enable real Supabase storage.
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Add New Source */}
      <div className="bg-secondary/30 border border-secondary rounded-2xl p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="h-5 w-5" />
          <h3 className="font-medium">Add New Knowledge Source</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-secondary-foreground mb-1 block">Type</label>
            <select
              value={newSource.type}
              onChange={(e) => setNewSource({ ...newSource, type: e.target.value as any })}
              className="w-full rounded-lg border border-secondary bg-background px-3 py-2 text-sm"
            >
              {Object.entries(typeLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-secondary-foreground mb-1 block">Title / Topic</label>
            <input
              type="text"
              value={newSource.title}
              onChange={(e) => setNewSource({ ...newSource, title: e.target.value })}
              placeholder="e.g. Pricing for Website Projects"
              className="w-full rounded-lg border border-secondary bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs text-secondary-foreground mb-1 block">Content</label>
          <textarea
            value={newSource.content_text}
            onChange={(e) => setNewSource({ ...newSource, content_text: e.target.value })}
            rows={4}
            placeholder="Detailed information the AI should know..."
            className="w-full rounded-lg border border-secondary bg-background px-3 py-2 text-sm font-mono"
          />
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            value={newSource.tags}
            onChange={(e) => setNewSource({ ...newSource, tags: e.target.value })}
            placeholder="Tags (comma separated)"
            className="flex-1 rounded-lg border border-secondary bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={addSource}
            disabled={!newSource.title || !newSource.content_text}
            className="px-6 py-2 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50"
          >
            Add Source
          </button>
        </div>
      </div>

      {/* Existing Sources */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium">Your Knowledge Sources ({sources.length})</h3>
        <button
          onClick={handleSaveAll}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-secondary hover:bg-secondary text-sm"
        >
          <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save All to AI'}
        </button>
      </div>

      {sources.length === 0 && (
        <div className="text-center py-12 text-secondary-foreground border border-dashed border-secondary rounded-2xl">
          No knowledge added yet. Start by adding your services, policies, and FAQs above.
        </div>
      )}

      <div className="space-y-4">
        {sources.map((source) => (
          <div key={source.id} className="bg-secondary/20 border border-secondary rounded-xl p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                    {typeLabels[source.type]}
                  </span>
                  <h4 className="font-medium">{source.title}</h4>
                </div>
                {source.tags && (
                  <div className="text-xs text-secondary-foreground mt-1">{source.tags}</div>
                )}
              </div>
              <button
                onClick={() => deleteSource(source.id)}
                className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm whitespace-pre-wrap text-secondary-foreground">{source.content_text}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 text-xs text-secondary-foreground">
        The AI will use these sources (status = ready) to answer questions accurately. 
        Sources are stored in wpm_knowledge_sources and become available to your AI DM Agent immediately.
      </div>
    </div>
  );
}
