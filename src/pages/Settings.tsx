import React, { useState, useEffect } from 'react';
import { Save, Check } from 'lucide-react';
import LogoUpload from '../components/LogoUpload';
import BotManagement from '../components/BotManagement';
import { getUserSettings, updateUserSettings, UserSettings } from '../lib/supabase/settings';

export default function Settings() {
  const [settings, setSettings] = useState<Partial<UserSettings>>({
    company_logo: null,
    response_style: 'professional',
    response_length: 'balanced',
    openai_api_key: null,
    openai_assistant_id: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      try {
        const userSettings = await getUserSettings();
        if (userSettings) {
          setSettings(userSettings);
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleLogoUpload = (newLogo: string) => {
    setSettings((prev) => ({ ...prev, company_logo: newLogo }));
  };

  const handleLogoRemove = () => {
    setSettings((prev) => ({ ...prev, company_logo: null }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateUserSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-2xl">
        <div className="animate-pulse">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-2xl">
      <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Settings</h1>

      <div className="space-y-4 md:space-y-6">
        <div className="bg-secondary/50 rounded-lg p-4 md:p-6">
          <BotManagement />
        </div>

        <div className="bg-secondary/50 rounded-lg p-4 md:p-6">
          <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Brand Settings</h2>
          <LogoUpload
            currentLogo={settings.company_logo || undefined}
            onUpload={handleLogoUpload}
            onRemove={handleLogoRemove}
          />
        </div>

        <div className="bg-secondary/50 rounded-lg p-4 md:p-6">
          <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Assistant Preferences</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Response Style</label>
              <select
                value={settings.response_style}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    response_style: e.target.value as UserSettings['response_style'],
                  }))
                }
                className="w-full bg-secondary rounded-lg px-4 py-2.5 md:py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm md:text-base"
              >
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="friendly">Friendly</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Response Length</label>
              <select
                value={settings.response_length}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    response_length: e.target.value as UserSettings['response_length'],
                  }))
                }
                className="w-full bg-secondary rounded-lg px-4 py-2.5 md:py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm md:text-base"
              >
                <option value="concise">Concise</option>
                <option value="balanced">Balanced</option>
                <option value="detailed">Detailed</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-secondary/50 rounded-lg p-4 md:p-6">
          <h2 className="text-base md:text-lg font-semibold mb-2 md:mb-4">Global API Configuration</h2>
          <p className="text-xs md:text-sm text-muted-foreground mb-3 md:mb-4">
            These settings will be used as defaults when bots don't have their own configuration.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">OpenAI API Key (Global Default)</label>
              <input
                type="password"
                placeholder="sk-..."
                value={settings.openai_api_key || ''}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, openai_api_key: e.target.value }))
                }
                className="w-full bg-secondary rounded-lg px-4 py-2.5 md:py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm md:text-base"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">OpenAI Dashboard</a>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">OpenAI Assistant ID (Global Default)</label>
              <input
                type="text"
                placeholder="asst_..."
                value={settings.openai_assistant_id || ''}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, openai_assistant_id: e.target.value }))
                }
                className="w-full bg-secondary rounded-lg px-4 py-2.5 md:py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-xs md:text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Create an assistant in your <a href="https://platform.openai.com/assistants" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">OpenAI Assistants</a> page
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-primary hover:bg-primary-hover active:bg-primary-hover text-white rounded-lg px-4 py-3 md:py-2 flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation text-sm md:text-base"
        >
          {saved ? (
            <>
              <Check className="w-4 h-4" />
              Saved!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
