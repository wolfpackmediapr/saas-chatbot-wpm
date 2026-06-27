import React, { useState, useEffect } from 'react';
import { Bot, Save, CheckCircle2, AlertCircle, Sparkles, Plus, Crown } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  getOwnedWpmClient,
  listBotProfiles,
  createBotProfile,
  updateBotProfile,
  getBotInstructions,
  upsertBotInstructions,
  getPlanLimits,
  listClientChannels,
  type WpmBotProfileRecord,
  type WpmClientChannel,
} from '../lib/supabase/wpmClients';
import { BUSINESS_TEMPLATES } from '../lib/businessTemplates';

const PRIMARY_GOALS = [
  'Book a Calendly meeting',
  'Collect contact info / lead capture',
  'Answer FAQs',
  'Qualify leads',
  'Drive to website / purchase',
] as const;

const RESPONSE_LANGUAGES = [
  'English + Latin American Spanish',
  'English only',
  'Spanish only',
  'Auto-detect',
] as const;

interface AgentSettings {
  instructions: string;
  neverSayRules: string;
  escalationPolicy: string;
  toneGuidelines: string;
  responseLength: string;
  primaryGoal: string;
  responseLanguage: string;
}

const defaultSettings: AgentSettings = {
  instructions:
    "You are a helpful, professional AI assistant for our business. Always be friendly and concise. Use the knowledge base for accurate information.",
  neverSayRules:
    "Never guarantee exact pricing, availability, or timelines unless explicitly provided in the knowledge base. Never promise a human will reply immediately.",
  escalationPolicy:
    "If the customer is angry, asks for a manager, or the query is complex, politely offer to have a human follow up and collect their contact details.",
  toneGuidelines:
    "Professional yet warm. Use Puerto Rico-friendly language when appropriate. Match the customer's energy level.",
  responseLength: 'medium',
  primaryGoal: 'Book a Calendly meeting',
  responseLanguage: 'English + Latin American Spanish',
};

// ─── Template Picker ──────────────────────────────────────────────────────────
interface TemplatePickerProps {
  activeId: string | null;
  onSelect: (id: string) => void;
}

function TemplatePicker({ activeId, onSelect }: TemplatePickerProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Quick-start templates</span>
        <span className="text-xs text-secondary-foreground ml-1">— select one to prefill agent instructions, then edit and save</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {BUSINESS_TEMPLATES.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={cn(
              'flex-shrink-0 flex flex-col items-center gap-1.5 rounded-xl border px-4 py-3 min-w-[100px] transition-all text-center',
              activeId === t.id
                ? 'border-primary bg-primary/10 text-primary shadow-sm'
                : 'border-secondary bg-secondary/20 text-secondary-foreground hover:border-primary/50 hover:text-foreground'
            )}
          >
            {t.icon
              ? <t.icon className="h-6 w-6" />
              : <span className="text-2xl leading-none">{t.emoji}</span>
            }
            <span className="text-xs font-medium leading-tight">{t.label}</span>
          </button>
        ))}
      </div>
      {activeId && (
        <p className="mt-3 text-xs text-emerald-400 flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Template loaded — review the fields below and click Save when ready.
        </p>
      )}
    </div>
  );
}

// ─── Agent list ───────────────────────────────────────────────────────────────
interface AgentListProps {
  agents: WpmBotProfileRecord[];
  selectedId: string | null;
  maxBots: number | null;
  channels: WpmClientChannel[];
  creating: boolean;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
}

function AgentList({ agents, selectedId, maxBots, channels, creating, onSelect, onCreate }: AgentListProps) {
  const [newName, setNewName] = useState<string | null>(null);
  const atLimit = maxBots !== null && agents.length >= maxBots;

  const channelsFor = (agentId: string) => {
    const assigned = channels.filter((c) => c.bot_profile_id === agentId);
    if (!assigned.length) return null;
    return assigned.map((c) => c.display_name || c.channel_type).join(', ');
  };

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-medium">
          Your Agents{maxBots !== null && ` (${agents.length} of ${maxBots})`}
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {agents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            onClick={() => onSelect(agent.id)}
            className={cn(
              'flex-shrink-0 flex flex-col items-start gap-1 rounded-xl border px-4 py-3 min-w-[140px] transition-all text-left',
              selectedId === agent.id
                ? 'border-primary bg-primary/10 shadow-sm'
                : 'border-secondary bg-secondary/20 hover:border-primary/50'
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Bot className="h-3.5 w-3.5 text-primary" />
              {agent.name || 'AI Assistant'}
            </span>
            <span className="text-xs text-secondary-foreground">
              {channelsFor(agent.id) ?? 'No channels assigned'}
            </span>
          </button>
        ))}

        {newName !== null ? (
          <form
            className="flex-shrink-0 flex items-center gap-2 rounded-xl border border-primary bg-secondary/20 px-3 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) { onCreate(newName.trim()); setNewName(null); }
            }}
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setNewName(null); }}
              placeholder="Agent name…"
              className="w-32 bg-transparent text-sm outline-none"
            />
            <button type="submit" disabled={creating} className="text-primary text-sm font-medium disabled:opacity-50">
              {creating ? '…' : 'Add'}
            </button>
          </form>
        ) : atLimit ? (
          <div className="flex-shrink-0 flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-secondary px-4 py-3 min-w-[140px] text-center">
            <Crown className="h-4 w-4 text-amber-400" />
            <span className="text-xs text-secondary-foreground">
              Agent limit reached —{' '}
              <a href="/dashboard/settings?tab=billing" className="text-primary hover:underline">upgrade</a>
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNewName('')}
            className="flex-shrink-0 flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-secondary px-4 py-3 min-w-[120px] text-secondary-foreground hover:border-primary/50 hover:text-foreground transition-all"
          >
            <Plus className="h-4 w-4" />
            <span className="text-xs font-medium">New Agent</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AgentSetup() {
  const [settings, setSettings] = useState<AgentSettings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [agents, setAgents] = useState<WpmBotProfileRecord[]>([]);
  const [botProfileId, setBotProfileId] = useState<string | null>(null);
  const [maxBots, setMaxBots] = useState<number | null>(1);
  const [channels, setChannels] = useState<WpmClientChannel[]>([]);
  const [creating, setCreating] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);

  // Load instructions for one agent into the form
  const loadAgent = async (profile: WpmBotProfileRecord) => {
    const instructions = await getBotInstructions(profile.id);
    const loaded: AgentSettings = { ...defaultSettings };

    if (instructions) {
      if (instructions.system_prompt) loaded.instructions = instructions.system_prompt;
      if (instructions.never_say_rules) loaded.neverSayRules = instructions.never_say_rules;
      if (instructions.handoff_rules) loaded.escalationPolicy = instructions.handoff_rules;
      if (instructions.business_summary) loaded.toneGuidelines = instructions.business_summary;
      if (instructions.primary_goal) loaded.primaryGoal = instructions.primary_goal;
      if (instructions.response_language) loaded.responseLanguage = instructions.response_language;
    }

    if (profile.response_length) {
      const map: Record<string, string> = { concise: 'short', balanced: 'medium', detailed: 'detailed' };
      loaded.responseLength = map[profile.response_length] || 'medium';
    }

    setSettings(loaded);
    setActiveTemplate(null);
    setSaved(false);
  };

  useEffect(() => {
    async function loadAgentSetup() {
      setLoading(true);
      setError(null);
      try {
        const client = await getOwnedWpmClient();
        if (!client) { setLoading(false); return; }
        setClientId(client.id);

        const [profiles, limits, clientChannels] = await Promise.all([
          listBotProfiles(client.id),
          getPlanLimits(),
          listClientChannels(client.id),
        ]);
        setAgents(profiles);
        setMaxBots(limits.max_bots);
        setChannels(clientChannels);

        if (!profiles.length) { setLoading(false); return; }
        setBotProfileId(profiles[0].id);
        await loadAgent(profiles[0]);
      } catch (err: any) {
        console.error('Failed to load agent setup', err);
        setError('Failed to load agent configuration. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    }
    loadAgentSetup();
  }, []);

  const handleSelectAgent = async (id: string) => {
    if (id === botProfileId) return;
    const profile = agents.find((a) => a.id === id);
    if (!profile) return;
    setBotProfileId(id);
    setError(null);
    try {
      await loadAgent(profile);
    } catch (err: any) {
      console.error('Failed to load agent', err);
      setError('Failed to load this agent. Please try again.');
    }
  };

  const handleCreateAgent = async (name: string) => {
    if (!clientId) return;
    setCreating(true);
    setError(null);
    try {
      const newId = await createBotProfile(clientId, name);
      const profiles = await listBotProfiles(clientId);
      setAgents(profiles);
      setBotProfileId(newId);
      setSettings({ ...defaultSettings });
      setActiveTemplate(null);
    } catch (err: any) {
      // The DB trigger enforces the tier cap; surface its message nicely
      const msg = String(err?.message ?? err);
      setError(msg.includes('Bot limit') ? msg : 'Failed to create agent. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const set = <K extends keyof AgentSettings>(field: K, value: AgentSettings[K]) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    setActiveTemplate(null);
    setSaved(false);
  };

  const applyTemplate = (templateId: string) => {
    const tpl = BUSINESS_TEMPLATES.find(t => t.id === templateId);
    if (!tpl) return;
    setSettings(prev => ({
      ...prev,
      instructions: tpl.agent.instructions,
      neverSayRules: tpl.agent.neverSayRules,
      escalationPolicy: tpl.agent.escalationPolicy,
      toneGuidelines: tpl.agent.toneGuidelines,
      responseLength: tpl.agent.responseLength,
      primaryGoal: tpl.agent.primaryGoal,
      responseLanguage: tpl.agent.responseLanguage,
    }));
    setActiveTemplate(templateId);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!clientId || !botProfileId) return;
    setSaving(true);
    setError(null);

    try {
      const lengthMap: Record<string, string> = { short: 'concise', medium: 'balanced', detailed: 'detailed' };

      await updateBotProfile(botProfileId, {
        tone: settings.toneGuidelines.split('.')[0] || undefined,
        response_length: lengthMap[settings.responseLength] || 'balanced',
      });

      await upsertBotInstructions(botProfileId, {
        system_prompt: settings.instructions,
        never_say_rules: settings.neverSayRules,
        handoff_rules: settings.escalationPolicy,
        business_summary: settings.toneGuidelines,
        lead_qualification_instructions:
          "Collect name, service interest, email, phone, and timeline naturally.",
        primary_goal: settings.primaryGoal,
        response_language: settings.responseLanguage,
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      console.error('Save agent setup failed', err);
      setError(err.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-4xl flex items-center justify-center min-h-[300px]">
        <div className="text-secondary-foreground">Loading agent configuration...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Bot className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-semibold">Agent Setup</h1>
        </div>
        <p className="text-secondary-foreground">
          Define how your AI should behave. These rules are applied to every conversation and stored in your bot instructions.
        </p>
        {!botProfileId && !loading && (
          <div className="mt-3 flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4" />
            Save your Business Profile first — it creates the bot profile that links everything together.
          </div>
        )}
      </div>

      {/* Agent list */}
      {agents.length > 0 && (
        <AgentList
          agents={agents}
          selectedId={botProfileId}
          maxBots={maxBots}
          channels={channels}
          creating={creating}
          onSelect={handleSelectAgent}
          onCreate={handleCreateAgent}
        />
      )}

      {/* Template picker */}
      <TemplatePicker activeId={activeTemplate} onSelect={applyTemplate} />

      {error && (
        <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="space-y-8">
        {/* Primary Goal + Response Language */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-secondary/30 border border-secondary rounded-2xl p-6">
            <label className="block text-sm font-medium mb-3">Primary Goal</label>
            <select
              value={settings.primaryGoal}
              onChange={e => set('primaryGoal', e.target.value)}
              className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary"
            >
              {PRIMARY_GOALS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <p className="text-xs text-secondary-foreground mt-2">What should the AI agent be optimized to accomplish?</p>
          </div>

          <div className="bg-secondary/30 border border-secondary rounded-2xl p-6">
            <label className="block text-sm font-medium mb-3">Response Language</label>
            <select
              value={settings.responseLanguage}
              onChange={e => set('responseLanguage', e.target.value)}
              className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary"
            >
              {RESPONSE_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <p className="text-xs text-secondary-foreground mt-2">Language(s) the agent uses when responding.</p>
          </div>
        </div>

        {/* Core Instructions */}
        <div className="bg-secondary/30 border border-secondary rounded-2xl p-8">
          <label className="block text-sm font-medium mb-3">Core Instructions</label>
          <textarea
            value={settings.instructions}
            onChange={e => set('instructions', e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary font-mono text-sm resize-y"
          />
          <p className="text-xs text-secondary-foreground mt-2">The main system prompt injected into every AI conversation.</p>
        </div>

        {/* Never Say Rules */}
        <div className="bg-secondary/30 border border-secondary rounded-2xl p-8">
          <label className="block text-sm font-medium mb-3">"Never Say" Rules</label>
          <textarea
            value={settings.neverSayRules}
            onChange={e => set('neverSayRules', e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary font-mono text-sm resize-y"
          />
          <p className="text-xs text-secondary-foreground mt-2">Hard limits the AI must never cross.</p>
        </div>

        {/* Escalation Policy */}
        <div className="bg-secondary/30 border border-secondary rounded-2xl p-8">
          <label className="block text-sm font-medium mb-3">Escalation Policy</label>
          <textarea
            value={settings.escalationPolicy}
            onChange={e => set('escalationPolicy', e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary font-mono text-sm resize-y"
          />
          <p className="text-xs text-secondary-foreground mt-2">When and how to hand off to a human.</p>
        </div>

        {/* Tone Guidelines + Response Length */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-secondary/30 border border-secondary rounded-2xl p-8">
            <label className="block text-sm font-medium mb-3">Tone Guidelines</label>
            <textarea
              value={settings.toneGuidelines}
              onChange={e => set('toneGuidelines', e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary resize-y"
            />
            <p className="text-xs text-secondary-foreground mt-2">Additional personality and style guidance.</p>
          </div>

          <div className="bg-secondary/30 border border-secondary rounded-2xl p-8">
            <label className="block text-sm font-medium mb-3">Preferred Response Length</label>
            <select
              value={settings.responseLength}
              onChange={e => set('responseLength', e.target.value)}
              className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary"
            >
              <option value="short">Short &amp; direct (1-2 sentences)</option>
              <option value="medium">Medium (recommended)</option>
              <option value="detailed">Detailed &amp; helpful</option>
            </select>
            <p className="text-xs text-secondary-foreground mt-3">Saved to your bot profile.</p>
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving || !clientId || !botProfileId}
          className={cn(
            'flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all',
            'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-70'
          )}
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Agent Setup'}
        </button>

        {saved && (
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            <span>Saved</span>
          </div>
        )}
      </div>

      <div className="mt-6 text-xs text-secondary-foreground">
        Stored in <code>wpm_bot_instructions</code> linked to your active bot profile.
        Injected into every AI response alongside your Knowledge Base.
      </div>
    </div>
  );
}
