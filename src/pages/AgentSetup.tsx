import React, { useState, useEffect } from 'react';
import { Bot, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { 
  getOwnedWpmClient, 
  getActiveBotProfile, 
  upsertBotProfile,
  getBotInstructions, 
  upsertBotInstructions 
} from '../lib/supabase/wpmClients';

interface AgentSettings {
  instructions: string;
  neverSayRules: string;
  escalationPolicy: string;
  toneGuidelines: string;
  responseLength: string;
}

const defaultSettings: AgentSettings = {
  instructions: "You are a helpful, professional AI assistant for our business. Always be friendly and concise. Use the knowledge base for accurate information.",
  neverSayRules: "Never guarantee exact pricing, availability, or timelines unless explicitly provided in the knowledge base. Never promise a human will reply immediately.",
  escalationPolicy: "If the customer is angry, asks for a manager, or the query is complex, politely offer to have a human follow up and collect their contact details.",
  toneGuidelines: "Professional yet warm. Use Puerto Rico-friendly language when appropriate. Match the customer's energy level.",
  responseLength: "medium",
};

export default function AgentSetup() {
  const [settings, setSettings] = useState<AgentSettings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [hasBotProfile, setHasBotProfile] = useState(false);

  useEffect(() => {
    async function loadAgentSetup() {
      setLoading(true);
      setError(null);

      try {
        const client = await getOwnedWpmClient();
        
        const isDemo = !client || client.id.startsWith('demo') || !client.id.includes('-');
        setIsDemoMode(isDemo);

        if (client && !isDemo) {
          const botProfile = await getActiveBotProfile(client.id);
          
          if (botProfile) {
            setHasBotProfile(true);

            // Load instructions
            const instructions = await getBotInstructions(botProfile.id);

            const loaded: AgentSettings = { ...defaultSettings };

            if (instructions) {
              if (instructions.system_prompt) loaded.instructions = instructions.system_prompt;
              if (instructions.never_say_rules) loaded.neverSayRules = instructions.never_say_rules;
              if (instructions.handoff_rules) loaded.escalationPolicy = instructions.handoff_rules;
              if (instructions.business_summary) loaded.toneGuidelines = instructions.business_summary; // reuse for tone guidance
            }

            // response length from bot profile
            if (botProfile.response_length) {
              const map: Record<string, string> = { concise: 'short', balanced: 'medium', detailed: 'detailed' };
              loaded.responseLength = map[botProfile.response_length] || 'medium';
            }

            // Also check localStorage for any overrides
            const savedLocal = localStorage.getItem('wpm-agent-setup');
            if (savedLocal) {
              const local = JSON.parse(savedLocal);
              // Only merge if DB didn't have strong data
              if (!instructions) Object.assign(loaded, local);
            }

            setSettings(loaded);
          } else {
            setHasBotProfile(false);
            // fallback to local
            const savedLocal = localStorage.getItem('wpm-agent-setup');
            if (savedLocal) setSettings(JSON.parse(savedLocal));
          }
        } else {
          // Demo mode
          const savedLocal = localStorage.getItem('wpm-agent-setup');
          if (savedLocal) setSettings(JSON.parse(savedLocal));
          setHasBotProfile(false);
        }
      } catch (err: any) {
        console.error('Failed to load agent setup', err);
        setError('Could not load from database. Using local data.');
        const savedLocal = localStorage.getItem('wpm-agent-setup');
        if (savedLocal) setSettings(JSON.parse(savedLocal));
        setIsDemoMode(true);
      } finally {
        setLoading(false);
      }
    }

    loadAgentSetup();
  }, []);

  const handleChange = (field: keyof AgentSettings, value: string) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // Always persist to localStorage
      localStorage.setItem('wpm-agent-setup', JSON.stringify(settings));

      const client = await getOwnedWpmClient();

      if (client && !isDemoMode && client.id && !client.id.startsWith('demo')) {
        const botProfile = await getActiveBotProfile(client.id);

        if (!botProfile) {
          setError("No active bot profile found. Please complete Business Profile first so we can create your AI agent configuration.");
          setSaving(false);
          return;
        }

        // Map response length
        const lengthMap: Record<string, string> = { 
          short: 'concise', 
          medium: 'balanced', 
          detailed: 'detailed' 
        };
        const dbResponseLength = lengthMap[settings.responseLength] || 'balanced';

        // Update bot profile tone/response (tone can be managed here too)
        await upsertBotProfile(client.id, {
          tone: settings.toneGuidelines.split('.')[0] || undefined, // rough extraction
          response_length: dbResponseLength,
        });

        // Save instructions
        await upsertBotInstructions(botProfile.id, {
          system_prompt: settings.instructions,
          never_say_rules: settings.neverSayRules,
          handoff_rules: settings.escalationPolicy,
          business_summary: settings.toneGuidelines, // using this field for tone guidance
          lead_qualification_instructions: "Collect name, service interest, email, phone, and timeline naturally.",
        });

        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        if (isDemoMode) {
          setError('Saved locally only. Complete Business Profile and connect to live Supabase for full persistence.');
        }
      }
    } catch (err: any) {
      console.error('Save agent setup failed', err);
      setError(err.message || 'Failed to save to database. Changes saved locally.');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
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
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Bot className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-semibold">Agent Setup</h1>
        </div>
        <p className="text-secondary-foreground">
          Define how your AI should behave. These rules are applied to every conversation and stored in your bot instructions.
        </p>
        {isDemoMode && (
          <div className="mt-3 flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4" />
            Demo mode — saved locally. Complete Business Profile first for real Supabase storage.
          </div>
        )}
        {!hasBotProfile && !isDemoMode && !loading && (
          <div className="mt-3 flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4" />
            No active bot profile yet. Save your Business Profile first to enable full agent configuration.
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="space-y-8">
        <div className="bg-secondary/30 border border-secondary rounded-2xl p-8">
          <label className="block text-sm font-medium mb-3">Core Instructions</label>
          <textarea
            value={settings.instructions}
            onChange={(e) => handleChange('instructions', e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary font-mono text-sm resize-y"
          />
          <p className="text-xs text-secondary-foreground mt-2">This is the main system prompt for the AI (maps to system_prompt).</p>
        </div>

        <div className="bg-secondary/30 border border-secondary rounded-2xl p-8">
          <label className="block text-sm font-medium mb-3">"Never Say" Rules</label>
          <textarea
            value={settings.neverSayRules}
            onChange={(e) => handleChange('neverSayRules', e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary font-mono text-sm resize-y"
          />
          <p className="text-xs text-secondary-foreground mt-2">Critical boundaries the AI must never cross (maps to never_say_rules).</p>
        </div>

        <div className="bg-secondary/30 border border-secondary rounded-2xl p-8">
          <label className="block text-sm font-medium mb-3">Escalation Policy</label>
          <textarea
            value={settings.escalationPolicy}
            onChange={(e) => handleChange('escalationPolicy', e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary font-mono text-sm resize-y"
          />
          <p className="text-xs text-secondary-foreground mt-2">When and how to hand off to a human (maps to handoff_rules).</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-secondary/30 border border-secondary rounded-2xl p-8">
            <label className="block text-sm font-medium mb-3">Tone Guidelines</label>
            <textarea
              value={settings.toneGuidelines}
              onChange={(e) => handleChange('toneGuidelines', e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary"
            />
            <p className="text-xs text-secondary-foreground mt-2">Additional personality and style guidance.</p>
          </div>

          <div className="bg-secondary/30 border border-secondary rounded-2xl p-8">
            <label className="block text-sm font-medium mb-3">Preferred Response Length</label>
            <select
              value={settings.responseLength}
              onChange={(e) => handleChange('responseLength', e.target.value)}
              className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary"
            >
              <option value="short">Short &amp; direct (1-2 sentences)</option>
              <option value="medium">Medium (recommended)</option>
              <option value="detailed">Detailed &amp; helpful</option>
            </select>
            <p className="text-xs text-secondary-foreground mt-3">You can override per conversation in Test Agent. Saved to your bot profile.</p>
          </div>
        </div>
      </div>

      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all",
            "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
          )}
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving Agent Rules to Supabase...' : 'Save Agent Setup'}
        </button>

        {saved && (
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            <span>Rules saved{isDemoMode ? ' (local)' : ''}</span>
          </div>
        )}
      </div>

      <div className="mt-6 text-xs text-secondary-foreground">
        These settings are stored in <code>wpm_bot_instructions</code> linked to your active bot profile. 
        They are injected into every AI response alongside your Knowledge Base.
      </div>
    </div>
  );
}
