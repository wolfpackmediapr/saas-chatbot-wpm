import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, Loader2, Save, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getOwnedWpmClient, mapClientRecordToBusinessProfile, saveOwnedWpmClient } from '../lib/supabase/wpmClients';
import {
  BusinessProfileInput,
  getBusinessProfileCompletion,
  validateBusinessProfileInput,
} from '../lib/wpm/selfSetup';

const DEFAULT_PROFILE: BusinessProfileInput = {
  name: '',
  industry: '',
  website_url: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  timezone: 'America/Puerto_Rico',
  preferred_language: 'English / Spanish',
  brand_voice: '',
};

const INDUSTRIES = [
  'Restaurant / Hospitality',
  'Beauty / Spa',
  'Medical / Dental',
  'Home Services',
  'Professional Services',
  'Ecommerce / Product Brand',
  'Tech / SaaS',
  'Other',
];

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-secondary-foreground">{label}</span>
      {children}
      {error && <span className="block text-sm text-red-400">{error}</span>}
    </label>
  );
}

export default function BusinessProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<BusinessProfileInput>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const validationErrors = useMemo(() => validateBusinessProfileInput(profile), [profile]);
  const completion = useMemo(() => getBusinessProfileCompletion(profile), [profile]);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      try {
        setLoading(true);
        const existingClient = await getOwnedWpmClient();
        if (mounted && existingClient) {
          setProfile({ ...DEFAULT_PROFILE, ...mapClientRecordToBusinessProfile(existingClient) });
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load business profile.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  const updateField = (field: keyof BusinessProfileInput, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
    setSuccess(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!user) {
      setError('You must be logged in to save your business profile.');
      return;
    }

    const errors = validateBusinessProfileInput(profile);
    if (Object.keys(errors).length > 0) {
      setError('Fix the highlighted fields before saving.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const savedClient = await saveOwnedWpmClient(profile, user.id);
      setProfile({ ...DEFAULT_PROFILE, ...mapClientRecordToBusinessProfile(savedClient) });
      setSuccess('Business profile saved. Next: choose the agent template and instructions.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save business profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-background p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="overflow-hidden rounded-2xl border border-secondary bg-secondary/30">
          <div className="relative p-6 md:p-8">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/20" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm text-primary">
                  <Building2 className="h-4 w-4" />
                  Step 1 · Self-setup foundation
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Business Profile</h1>
                  <p className="mt-3 text-secondary-foreground">
                    Create the client-owned setup record the agent uses for channels, instructions, knowledge, automations, and launch readiness.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-secondary bg-background/80 p-5 shadow-lg backdrop-blur">
                <div className="text-sm text-secondary-foreground">Profile readiness</div>
                <div className="mt-1 text-4xl font-bold">{completion.percentComplete}%</div>
                <div className="mt-2 h-2 w-56 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all"
                    style={{ width: `${completion.percentComplete}%` }}
                  />
                </div>
                <div className="mt-3 text-sm text-secondary-foreground">
                  {completion.completed} of {completion.total} required fields complete
                </div>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
            <ShieldAlert className="mt-0.5 h-5 w-5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4 text-primary">
            <CheckCircle2 className="mt-0.5 h-5 w-5" />
            <span>{success}</span>
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-secondary bg-secondary/20 p-5 md:p-6">
            {loading ? (
              <div className="flex items-center gap-3 text-secondary-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading business profile...
              </div>
            ) : (
              <>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Business name" error={validationErrors.name}>
                    <input
                      value={profile.name}
                      onChange={(event) => updateField('name', event.target.value)}
                      className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary"
                      placeholder="WolfPack Media"
                    />
                  </Field>

                  <Field label="Industry">
                    <select
                      value={profile.industry}
                      onChange={(event) => updateField('industry', event.target.value)}
                      className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary"
                    >
                      <option value="">Select industry</option>
                      {INDUSTRIES.map((industry) => (
                        <option key={industry} value={industry}>{industry}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Website" error={validationErrors.website_url}>
                    <input
                      value={profile.website_url}
                      onChange={(event) => updateField('website_url', event.target.value)}
                      className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary"
                      placeholder="https://example.com"
                    />
                  </Field>

                  <Field label="Contact email" error={validationErrors.contact_email}>
                    <input
                      value={profile.contact_email}
                      onChange={(event) => updateField('contact_email', event.target.value)}
                      className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary"
                      placeholder="owner@example.com"
                    />
                  </Field>

                  <Field label="Contact name">
                    <input
                      value={profile.contact_name}
                      onChange={(event) => updateField('contact_name', event.target.value)}
                      className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary"
                      placeholder="Owner / manager name"
                    />
                  </Field>

                  <Field label="Phone">
                    <input
                      value={profile.contact_phone}
                      onChange={(event) => updateField('contact_phone', event.target.value)}
                      className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary"
                      placeholder="787-000-0000"
                    />
                  </Field>

                  <Field label="Timezone">
                    <input
                      value={profile.timezone}
                      onChange={(event) => updateField('timezone', event.target.value)}
                      className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary"
                      placeholder="America/Puerto_Rico"
                    />
                  </Field>

                  <Field label="Preferred language">
                    <input
                      value={profile.preferred_language}
                      onChange={(event) => updateField('preferred_language', event.target.value)}
                      className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary"
                      placeholder="English / Spanish"
                    />
                  </Field>
                </div>

                <Field label="Brand voice / operating style">
                  <textarea
                    value={profile.brand_voice}
                    onChange={(event) => updateField('brand_voice', event.target.value)}
                    className="min-h-28 w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary"
                    placeholder="Example: sharp, premium, direct, bilingual PR Spanish when useful, results-first."
                  />
                </Field>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                  Save business profile
                </button>
              </>
            )}
          </form>

          <aside className="space-y-4 rounded-2xl border border-secondary bg-secondary/20 p-5">
            <h2 className="text-xl font-semibold">Launch blockers</h2>
            {completion.ready ? (
              <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-primary">
                Business profile is ready for the next self-setup step.
              </div>
            ) : (
              <ul className="space-y-2 text-sm text-secondary-foreground">
                {completion.blockers.map((blocker) => (
                  <li key={blocker} className="rounded-lg bg-background/70 p-3">{blocker}</li>
                ))}
              </ul>
            )}

            <div className="rounded-xl bg-background/70 p-4 text-sm text-secondary-foreground">
              Next after this: agent template, instructions, knowledge, channels, automations, simulator, then live launch.
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
