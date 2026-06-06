import React, { useState, useEffect } from 'react';
import { Bot, Save, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';

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

  useEffect(() => {
    const savedSettings = localStorage.getItem('wpm-agent-setup');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, []);

  const handleChange = (field: keyof AgentSettings, value: string) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      localStorage.setItem('wpm-agent-setup', JSON.stringify(settings));
      // TODO: Persist to Supabase wpm_bot_instructions
      await new Promise(r => setTimeout(r, 600));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Bot className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-semibold">Agent Setup</h1>
        </div>
        <p className="text-secondary-foreground">
          Define how your AI should behave. These rules are applied to every conversation.
        </p>
      </div>

      <div className="space-y-8">
        <div className="bg-secondary/30 border border-secondary rounded-2xl p-8">
          <label className="block text-sm font-medium mb-3">Core Instructions</label>
          <textarea
            value={settings.instructions}
            onChange={(e) => handleChange('instructions', e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary font-mono text-sm resize-y"
          />
          <p className="text-xs text-secondary-foreground mt-2">This is the main system prompt for the AI.</p>
        </div>

        <div className="bg-secondary/30 border border-secondary rounded-2xl p-8">
          <label className="block text-sm font-medium mb-3">"Never Say" Rules</label>
          <textarea
            value={settings.neverSayRules}
            onChange={(e) => handleChange('neverSayRules', e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary font-mono text-sm resize-y"
          />
          <p className="text-xs text-secondary-foreground mt-2">Critical boundaries the AI must never cross.</p>
        </div>

        <div className="bg-secondary/30 border border-secondary rounded-2xl p-8">
          <label className="block text-sm font-medium mb-3">Escalation Policy</label>
          <textarea
            value={settings.escalationPolicy}
            onChange={(e) => handleChange('escalationPolicy', e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary font-mono text-sm resize-y"
          />
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
            <p className="text-xs text-secondary-foreground mt-3">You can override per conversation in Test Agent.</p>
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
          {saving ? 'Saving Agent Rules...' : 'Save Agent Setup'}
        </button>

        {saved && (
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            <span>Rules saved</span>
          </div>
        )}
      </div>
    </div>
  );
}
