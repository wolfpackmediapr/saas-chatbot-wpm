import React, { useState, useEffect } from 'react';
import { BookOpenText, Plus, Trash2, Save, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';

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

export default function KnowledgeBase() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [newSource, setNewSource] = useState<Partial<KnowledgeSource>>({
    type: 'faq',
    title: '',
    content_text: '',
    tags: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('wpm-knowledge-base');
    if (saved) {
      setSources(JSON.parse(saved));
    }
  }, []);

  const saveToStorage = (updated: KnowledgeSource[]) => {
    localStorage.setItem('wpm-knowledge-base', JSON.stringify(updated));
    // TODO: Sync to Supabase wpm_knowledge_sources
  };

  const addSource = () => {
    if (!newSource.title || !newSource.content_text) return;

    const source: KnowledgeSource = {
      id: Date.now().toString(36),
      type: newSource.type as any,
      title: newSource.title,
      content_text: newSource.content_text,
      tags: newSource.tags || '',
    };

    const updated = [...sources, source];
    setSources(updated);
    saveToStorage(updated);

    setNewSource({ type: 'faq', title: '', content_text: '', tags: '' });
  };

  const deleteSource = (id: string) => {
    const updated = sources.filter(s => s.id !== id);
    setSources(updated);
    saveToStorage(updated);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 500));
    setSaving(false);
  };

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
      </div>

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
        The AI will use these sources to answer questions accurately. Add your most common questions and policies first.
      </div>
    </div>
  );
}
