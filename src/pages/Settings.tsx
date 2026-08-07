import React, { useState, useEffect, useCallback } from 'react';
import {
  Save,
  Check,
  AlertCircle,
  LogOut,
  User as UserIcon,
  Image as ImageIcon,
  Bot as BotIcon,
  Key as KeyIcon,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import LogoUpload from '../components/LogoUpload';
import BotManagement from '../components/BotManagement';
import Subscription from './Subscription';
import Help from './Help';
import {
  getUserSettings,
  updateUserSettings,
  getProfile,
  updateProfileName,
  UserSettings,
} from '../lib/supabase/settings';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

const tabs = [
  { id: 'general', label: 'General' },
  { id: 'billing', label: 'Billing & Subscription' },
  { id: 'help', label: 'Help Center' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: TabId = tabs.some((t) => t.id === tabParam) ? (tabParam as TabId) : 'general';

  const selectTab = (id: TabId) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', id);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-4xl">
      <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Settings</h1>

      <div className="border-b border-secondary mb-4 md:mb-6">
        <nav className="flex gap-1 md:gap-2 -mb-px overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => selectTab(tab.id)}
              className={cn(
                'px-3 md:px-4 py-2.5 text-sm md:text-base whitespace-nowrap border-b-2 transition-colors touch-manipulation',
                activeTab === tab.id
                  ? 'border-primary text-foreground font-medium'
                  : 'border-transparent text-secondary-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'general' && <GeneralSettings />}
      {activeTab === 'billing' && <Subscription />}
      {activeTab === 'help' && <Help />}
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'bg-secondary/50 rounded-xl p-4 md:p-6 border border-secondary/60',
        className,
      )}
    >
      <div className="flex items-start gap-3 mb-4 md:mb-5">
        <div className="rounded-lg bg-primary/10 p-2 flex-shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base md:text-lg font-semibold">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-lg p-3 text-sm">
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-secondary/50 rounded-xl p-4 md:p-6 border border-secondary/60 animate-pulse">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-secondary" />
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-secondary" />
          <div className="h-3 w-48 rounded bg-secondary/60" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-10 rounded-lg bg-secondary/60" />
        <div className="h-10 rounded-lg bg-secondary/60" />
      </div>
    </div>
  );
}

function GeneralSettings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [settings, setSettings] = useState<Partial<UserSettings>>({
    company_logo: null,
    openai_api_key: null,
    openai_assistant_id: null,
  });
  const [profileName, setProfileName] = useState('');
  const [originalProfileName, setOriginalProfileName] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [assistantIdInput, setAssistantIdInput] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [hasAssistantId, setHasAssistantId] = useState(false);

  useEffect(() => {
    async function loadAll() {
      try {
        const [userSettings, profile] = await Promise.all([
          getUserSettings(),
          getProfile().catch(() => null),
        ]);
        if (userSettings) {
          setSettings(userSettings);
          setHasApiKey(!!userSettings.openai_api_key);
          setHasAssistantId(!!userSettings.openai_assistant_id);
          setApiKeyInput('');
          setAssistantIdInput(userSettings.openai_assistant_id || '');
        }
        if (profile?.name) {
          setProfileName(profile.name);
          setOriginalProfileName(profile.name);
        } else if (user?.email) {
          const emailName = user.email.split('@')[0];
          setProfileName(emailName);
          setOriginalProfileName(emailName);
        }
      } catch (err) {
        setError('Failed to load your settings. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, [user?.email]);

  const flashSaved = (section: string) => {
    setSavedSection(section);
    setTimeout(() => setSavedSection(null), 2500);
  };

  const handleLogoUpload = (newLogo: string) => {
    setSettings((prev) => ({ ...prev, company_logo: newLogo }));
  };

  const handleLogoRemove = () => {
    setSettings((prev) => ({ ...prev, company_logo: null }));
  };

  const handleSaveBrand = async () => {
    setSavingSection('brand');
    setError(null);
    try {
      await updateUserSettings({ company_logo: settings.company_logo });
      flashSaved('brand');
    } catch (err) {
      setError('Failed to save your logo. Please try again.');
    } finally {
      setSavingSection(null);
    }
  };

  const handleSaveProfile = async () => {
    if (!profileName.trim()) return;
    setSavingSection('profile');
    setError(null);
    try {
      await updateProfileName(profileName.trim());
      setOriginalProfileName(profileName.trim());
      flashSaved('profile');
    } catch (err) {
      setError('Failed to update your profile name. Please try again.');
    } finally {
      setSavingSection(null);
    }
  };

  const handleSaveKeys = async () => {
    setSavingSection('keys');
    setError(null);
    try {
      const updates: Partial<UserSettings> = {};
      if (apiKeyInput.trim()) {
        updates.openai_api_key = apiKeyInput.trim();
      }
      if (assistantIdInput !== (settings.openai_assistant_id || '')) {
        updates.openai_assistant_id = assistantIdInput.trim() || null;
      }
      if (Object.keys(updates).length > 0) {
        await updateUserSettings(updates);
        if (updates.openai_api_key) {
          setHasApiKey(true);
          setApiKeyInput('');
        }
        if (updates.openai_assistant_id !== undefined) {
          setHasAssistantId(!!updates.openai_assistant_id);
        }
      }
      flashSaved('keys');
    } catch (err) {
      setError('Failed to save your OpenAI keys. Please try again.');
    } finally {
      setSavingSection(null);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      setError('Failed to sign out. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 md:space-y-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const brandDirty = settings.company_logo !== undefined;
  const profileDirty = profileName !== originalProfileName;
  const keysDirty =
    apiKeyInput.trim() !== '' ||
    assistantIdInput !== (settings.openai_assistant_id || '');

  return (
    <div className="space-y-4 md:space-y-6">
      {error && <ErrorBanner message={error} />}

      {/* Account */}
      <SectionCard
        icon={UserIcon}
        title="Account"
        description="Your signed-in account details."
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Email</label>
            <div className="w-full bg-secondary/70 rounded-lg px-4 py-2.5 text-sm text-muted-foreground border border-secondary/60">
              {user?.email || 'Unknown'}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Display name</label>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="w-full bg-secondary rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm md:text-base border border-secondary/60"
              placeholder="Your name"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveProfile}
              disabled={savingSection === 'profile' || !profileName.trim() || !profileDirty}
              className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover active:bg-primary-hover text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
            >
              {savedSection === 'profile' ? (
                <>
                  <Check className="w-4 h-4" />
                  Saved
                </>
              ) : savingSection === 'profile' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Name
                </>
              )}
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg px-4 py-2.5 transition-colors touch-manipulation"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Brand & Appearance */}
      <SectionCard
        icon={ImageIcon}
        title="Brand & Appearance"
        description="Your company logo appears in the chat sidebar and on shared conversations."
      >
        <div className="space-y-5">
          <LogoUpload
            currentLogo={settings.company_logo || undefined}
            onUpload={handleLogoUpload}
            onRemove={handleLogoRemove}
          />
          <button
            onClick={handleSaveBrand}
            disabled={savingSection === 'brand' || !brandDirty}
            className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover active:bg-primary-hover text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
          >
            {savedSection === 'brand' ? (
              <>
                <Check className="w-4 h-4" />
                Saved
              </>
            ) : savingSection === 'brand' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Logo
              </>
            )}
          </button>
        </div>
      </SectionCard>

      {/* AI Bots */}
      <SectionCard
        icon={BotIcon}
        title="AI Bots"
        description="Create and manage your AI assistants. Full bot behavior is configured on the Agent Setup page."
      >
        <BotManagement />
        <button
          onClick={() => navigate('/dashboard/agent-setup')}
          className="mt-4 flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover transition-colors touch-manipulation"
        >
          Go to Agent Setup
          <ArrowRight className="w-4 h-4" />
        </button>
      </SectionCard>

      {/* OpenAI Keys */}
      <SectionCard
        icon={KeyIcon}
        title="OpenAI Keys"
        description="Your global OpenAI API key and Assistant ID. Individual bots can override these."
      >
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium">API Key</label>
              <span
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full font-medium',
                  hasApiKey
                    ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                    : 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
                )}
              >
                {hasApiKey ? 'Configured' : 'Not configured'}
              </span>
            </div>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="w-full bg-secondary rounded-lg px-4 py-2.5 pr-11 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm md:text-base border border-secondary/60 font-mono"
                placeholder={hasApiKey ? 'Enter new key to replace' : 'sk-...'}
              />
              <button
                type="button"
                onClick={() => setShowApiKey((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                title={showApiKey ? 'Hide' : 'Reveal'}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Leave blank to keep your current key. Your key is stored encrypted and never shown in full.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium">Assistant ID</label>
              <span
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full font-medium',
                  hasAssistantId
                    ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                    : 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
                )}
              >
                {hasAssistantId ? 'Configured' : 'Not configured'}
              </span>
            </div>
            <input
              type="text"
              value={assistantIdInput}
              onChange={(e) => setAssistantIdInput(e.target.value)}
              className="w-full bg-secondary rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm md:text-base border border-secondary/60 font-mono"
              placeholder="asst_..."
            />
          </div>

          <button
            onClick={handleSaveKeys}
            disabled={savingSection === 'keys' || !keysDirty}
            className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover active:bg-primary-hover text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
          >
            {savedSection === 'keys' ? (
              <>
                <Check className="w-4 h-4" />
                Saved
              </>
            ) : savingSection === 'keys' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Keys
              </>
            )}
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
