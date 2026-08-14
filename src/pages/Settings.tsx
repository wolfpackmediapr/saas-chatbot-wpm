import React, { useState, useEffect } from 'react';
import {
  Save,
  Check,
  AlertCircle,
  LogOut,
  User as UserIcon,
  Image as ImageIcon,
  Building2,
  Lock,
  Loader2,
  ArrowRight,
  Eye,
  EyeOff,
  Trash2,
} from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import LogoUpload from '../components/LogoUpload';
import Subscription from './Subscription';
import Help from './Help';
import {
  getUserSettings,
  updateUserSettings,
  getProfile,
  updateProfileName,
  UserSettings,
} from '../lib/supabase/settings';
import { updatePassword, deleteAccount } from '../lib/supabase/auth';
import { getOwnedWpmClient } from '../lib/supabase/wpmClients';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

/**
 * Settings owns the account and the workspace. Product configuration lives on
 * the page that owns it — Agent Setup, Channels, Business Profile — and is
 * linked to from here rather than mirrored, so there is never a second place
 * that looks like it configures something but doesn't.
 */
const tabs = [
  { id: 'account', label: 'Account' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'plan', label: 'Plan & Usage' },
  { id: 'help', label: 'Help' },
] as const;

type TabId = (typeof tabs)[number]['id'];

/** Tab ids used before the rebuild, kept working so old links don't 404. */
const LEGACY_TAB_ALIASES: Record<string, TabId> = {
  general: 'account',
  billing: 'plan',
  subscription: 'plan',
};

function resolveTab(raw: string | null): TabId {
  if (!raw) return 'account';
  if (tabs.some((t) => t.id === raw)) return raw as TabId;
  return LEGACY_TAB_ALIASES[raw] ?? 'account';
}

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveTab(searchParams.get('tab'));

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
                  : 'border-transparent text-secondary-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'account' && <AccountSettings />}
      {activeTab === 'workspace' && <WorkspaceSettings />}
      {activeTab === 'plan' && <Subscription embedded />}
      {activeTab === 'help' && <Help embedded />}
    </div>
  );
}

// ─── Shared pieces ───────────────────────────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-secondary/50 rounded-xl p-4 md:p-6 border border-secondary/60">
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

function Banner({ kind, message }: { kind: 'error' | 'success'; message: string }) {
  const error = kind === 'error';
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg p-3 text-sm border',
        error
          ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
          : 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400',
      )}
    >
      {error ? (
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      ) : (
        <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
      )}
      <span>{message}</span>
    </div>
  );
}

function SaveButton({
  onClick,
  disabled,
  saving,
  saved,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  saving: boolean;
  saved: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover active:bg-primary-hover text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
    >
      {saved ? (
        <>
          <Check className="w-4 h-4" />
          Saved
        </>
      ) : saving ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Saving…
        </>
      ) : (
        <>
          <Save className="w-4 h-4" />
          {label}
        </>
      )}
    </button>
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

const inputClass =
  'w-full bg-secondary rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm md:text-base border border-secondary/60';

// ─── Account ─────────────────────────────────────────────────────────────────

function AccountSettings() {
  const { user, signOut } = useAuth();

  const [profileName, setProfileName] = useState('');
  const [originalProfileName, setOriginalProfileName] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const profile = await getProfile().catch(() => null);
        const fallback = user?.email?.split('@')[0] ?? '';
        const name = profile?.name || fallback;
        setProfileName(name);
        setOriginalProfileName(name);
      } catch {
        setError('Could not load your account. Refresh the page to try again.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user?.email]);

  const flashSaved = (section: string) => {
    setSavedSection(section);
    setTimeout(() => setSavedSection(null), 2500);
  };

  const handleSaveProfile = async () => {
    if (!profileName.trim()) return;
    setSavingSection('profile');
    setError(null);
    try {
      await updateProfileName(profileName.trim());
      setOriginalProfileName(profileName.trim());
      flashSaved('profile');
    } catch {
      setError('Could not update your name. Try again.');
    } finally {
      setSavingSection(null);
    }
  };

  const handleChangePassword = async () => {
    setPasswordNotice(null);
    setError(null);

    if (newPassword.length < 8) {
      setError('Use at least 8 characters for your new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Those passwords do not match.');
      return;
    }

    setSavingSection('password');
    try {
      await updatePassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice('Password updated. Use it next time you sign in.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your password.');
    } finally {
      setSavingSection(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 md:space-y-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const profileDirty = profileName !== originalProfileName;
  const passwordReady = newPassword.length > 0 && confirmPassword.length > 0;

  return (
    <div className="space-y-4 md:space-y-6">
      {error && <Banner kind="error" message={error} />}

      <SectionCard icon={UserIcon} title="Account" description="How you sign in and appear in the app.">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Email</label>
            <div className="w-full bg-secondary/70 rounded-lg px-4 py-2.5 text-sm text-muted-foreground border border-secondary/60">
              {user?.email || 'Unknown'}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="display-name">
              Display name
            </label>
            <input
              id="display-name"
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className={inputClass}
              placeholder="Your name"
            />
          </div>
          <div className="flex items-center gap-3">
            <SaveButton
              onClick={handleSaveProfile}
              disabled={savingSection === 'profile' || !profileName.trim() || !profileDirty}
              saving={savingSection === 'profile'}
              saved={savedSection === 'profile'}
              label="Save name"
            />
            <button
              onClick={() => signOut().catch(() => setError('Could not sign out. Try again.'))}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg px-4 py-2.5 transition-colors touch-manipulation"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={Lock} title="Password" description="Change the password you use to sign in.">
        <div className="space-y-4">
          {passwordNotice && <Banner kind="success" message={passwordNotice} />}
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="new-password">
              New password
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={cn(inputClass, 'pr-11')}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="confirm-password">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              placeholder="Re-enter it"
              autoComplete="new-password"
            />
          </div>
          <SaveButton
            onClick={handleChangePassword}
            disabled={savingSection === 'password' || !passwordReady}
            saving={savingSection === 'password'}
            saved={false}
            label="Update password"
          />
        </div>
      </SectionCard>

      <DeleteAccountSection email={user?.email ?? ''} onDeleted={signOut} />
    </div>
  );
}

// ─── Delete account ──────────────────────────────────────────────────────────

/**
 * The in-app half of the deletion promise published at
 * wolfpackmediapr.com/data-deletion. Deletion is immediate and total, so the
 * confirmation is deliberately awkward: the account's own email has to be typed
 * exactly. The edge function re-checks it — this is a speed bump, not the guard.
 */
function DeleteAccountSection({ email, onDeleted }: { email: string; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = confirm.trim().toLowerCase() === email.toLowerCase() && email.length > 0;

  const handleDelete = async () => {
    if (!matches) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount(confirm.trim());
      // Data and identity are gone; the session left behind is meaningless.
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deletion failed. Please contact support.');
      setDeleting(false);
    }
  };

  return (
    <SectionCard
      icon={Trash2}
      title="Delete account"
      description="Permanently erase your account and everything in it."
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This removes your business profile, agent settings, every conversation and
          message, all saved leads, your knowledge base, and your connected Facebook and
          Instagram access tokens. Any active subscription is cancelled.
        </p>

        <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-4">
          <p className="text-sm font-medium text-red-500 mb-1">This is permanent.</p>
          <p className="text-sm text-muted-foreground">
            It cannot be undone and we cannot recover the data afterwards. Type{' '}
            <span className="font-mono text-foreground">{email}</span> below to confirm.
          </p>
        </div>

        <input
          type="email"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={email}
          autoComplete="off"
          disabled={deleting}
          aria-label="Type your email address to confirm account deletion"
          className="w-full px-3 py-2.5 rounded-lg bg-background border border-secondary focus:border-primary outline-none text-sm"
        />

        {error && <Banner kind="error" message={error} />}

        {/* Label fixed by the published instructions at /data-deletion, which
            say to type your email and then click "Delete my account". The page
            describing a control that does not exist is the exact failure this
            section was built to fix, so the wording tracks the page. */}
        <button
          onClick={handleDelete}
          disabled={!matches || deleting}
          className={cn(
            'px-4 py-2.5 rounded-lg text-sm font-medium transition-colors touch-manipulation inline-flex items-center gap-2',
            matches && !deleting
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'bg-secondary text-muted-foreground cursor-not-allowed',
          )}
        >
          {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
          {deleting ? 'Deleting…' : 'Delete my account'}
        </button>
      </div>
    </SectionCard>
  );
}

// ─── Workspace ───────────────────────────────────────────────────────────────

function WorkspaceSettings() {
  const navigate = useNavigate();

  const [logo, setLogo] = useState<string | null>(null);
  const [originalLogo, setOriginalLogo] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [settings, client] = await Promise.all([
          getUserSettings(),
          getOwnedWpmClient().catch(() => null),
        ]);
        const current = (settings as UserSettings | null)?.company_logo ?? null;
        setLogo(current);
        setOriginalLogo(current);
        setBusinessName(client?.name ?? null);
      } catch {
        setError('Could not load your workspace. Refresh the page to try again.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateUserSettings({ company_logo: logo });
      setOriginalLogo(logo);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Could not save your logo. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 md:space-y-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  // Compared against the loaded value — the previous version compared against
  // `undefined`, so the button was permanently enabled.
  const logoDirty = logo !== originalLogo;

  return (
    <div className="space-y-4 md:space-y-6">
      {error && <Banner kind="error" message={error} />}

      <SectionCard
        icon={ImageIcon}
        title="Logo"
        description="Shown in your sidebar and on shared conversations."
      >
        <div className="space-y-5">
          <LogoUpload
            currentLogo={logo || undefined}
            onUpload={(next) => setLogo(next)}
            onRemove={() => setLogo(null)}
          />
          <SaveButton
            onClick={handleSave}
            disabled={saving || !logoDirty}
            saving={saving}
            saved={saved}
            label="Save logo"
          />
        </div>
      </SectionCard>

      <SectionCard
        icon={Building2}
        title="Business profile"
        description="What your agents say about your business — name, industry, services and location."
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Business</label>
            <div className="w-full bg-secondary/70 rounded-lg px-4 py-2.5 text-sm text-muted-foreground border border-secondary/60">
              {businessName ?? 'Not set up yet'}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Your business details are edited on their own page so your agents always read from one source.
          </p>
          <button
            onClick={() => navigate('/dashboard/business-profile')}
            className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover transition-colors touch-manipulation"
          >
            Edit business profile
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
