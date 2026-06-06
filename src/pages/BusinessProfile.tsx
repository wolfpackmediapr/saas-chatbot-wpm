import React, { useState, useEffect } from 'react';
import { Building2, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { 
  getOwnedWpmClient, 
  updateClientProfile, 
  getActiveBotProfile, 
  upsertBotProfile,
  WpmClientRecord,
  WpmBotProfileRecord 
} from '../lib/supabase/wpmClients';

interface BusinessProfileData {
  name: string;
  description: string;
  services: string;
  tone: string;
  location: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
}

const defaultProfile: BusinessProfileData = {
  name: '',
  description: '',
  services: '',
  tone: 'professional and friendly',
  location: '',
  contactEmail: '',
  contactPhone: '',
  website: '',
};

export default function BusinessProfile() {
  const [profile, setProfile] = useState<BusinessProfileData>(defaultProfile);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<WpmClientRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      setError(null);

      try {
        const ownedClient = await getOwnedWpmClient();
        setClient(ownedClient);

        const isDemo = !ownedClient || ownedClient.id.startsWith('demo') || !ownedClient.id.includes('-');
        setIsDemoMode(isDemo);

        if (ownedClient) {
          // Start with client data
          const loaded: BusinessProfileData = {
            ...defaultProfile,
            name: ownedClient.name || '',
            website: ownedClient.website_url || '',
            contactEmail: ownedClient.contact_email || '',
            contactPhone: ownedClient.contact_phone || '',
          };

          // Merge from localStorage as fallback
          const savedLocal = localStorage.getItem('wpm-business-profile');
          if (savedLocal) {
            const local = JSON.parse(savedLocal);
            Object.assign(loaded, local);
          }

          // Load richer data from active bot profile (tone + settings)
          if (!isDemo) {
            const botProfile = await getActiveBotProfile(ownedClient.id);
            if (botProfile) {
              if (botProfile.tone) loaded.tone = botProfile.tone;
              if (botProfile.settings) {
                const s = botProfile.settings;
                if (s.description) loaded.description = s.description;
                if (s.services) loaded.services = s.services;
                if (s.location) loaded.location = s.location;
              }
            }
          }

          setProfile(loaded);
        } else {
          // Pure local fallback
          const savedLocal = localStorage.getItem('wpm-business-profile');
          if (savedLocal) {
            setProfile(JSON.parse(savedLocal));
          }
          setIsDemoMode(true);
        }
      } catch (err: any) {
        console.error('Failed to load business profile', err);
        setError('Could not load from database. Using local data.');
        // Fallback to localStorage
        const savedLocal = localStorage.getItem('wpm-business-profile');
        if (savedLocal) setProfile(JSON.parse(savedLocal));
        setIsDemoMode(true);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  const handleChange = (field: keyof BusinessProfileData, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // Always save to localStorage as backup
      localStorage.setItem('wpm-business-profile', JSON.stringify(profile));

      if (client && !isDemoMode && client.id && !client.id.startsWith('demo')) {
        // Real Supabase save
        // 1. Update wpm_clients (core business info)
        await updateClientProfile(client.id, {
          name: profile.name,
          website_url: profile.website || null,
          contact_email: profile.contactEmail || null,
          contact_phone: profile.contactPhone || null,
          // Put description/services into notes for now (or we could add a jsonb column later)
          notes: [profile.description, profile.services, profile.location].filter(Boolean).join(' | ') || null,
        });

        // 2. Update or create active wpm_bot_profiles (tone + rich settings for the AI)
        await upsertBotProfile(client.id, {
          name: profile.name,
          public_name: profile.name,
          tone: profile.tone,
          settings: {
            description: profile.description,
            services: profile.services,
            location: profile.location,
            website: profile.website,
            contact_email: profile.contactEmail,
            contact_phone: profile.contactPhone,
            updated_from: 'business-profile-page',
          },
        });

        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        // Demo / no client yet mode
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        if (isDemoMode) {
          setError('Saved locally only. Create a real client in the database (or run the seed) to persist to Supabase.');
        }
      }
    } catch (err: any) {
      console.error('Save failed', err);
      setError(err.message || 'Failed to save to database. Data saved locally instead.');
      // Still consider it "saved" locally
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-4xl flex items-center justify-center min-h-[300px]">
        <div className="text-secondary-foreground">Loading business profile...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-semibold">Business Profile</h1>
        </div>
        <p className="text-secondary-foreground">
          Tell the AI who you are. This information is used in every response and powers your AI DM Agent.
        </p>
        {isDemoMode && (
          <div className="mt-3 flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4" />
            Demo mode — changes are saved locally. Connect to live Supabase (or create a client) for permanent storage.
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="bg-secondary/30 border border-secondary rounded-2xl p-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">Business Name</label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="WolfPack Media"
              className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Location</label>
            <input
              type="text"
              value={profile.location}
              onChange={(e) => handleChange('location', e.target.value)}
              placeholder="San Juan, Puerto Rico"
              className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Short Description</label>
          <textarea
            value={profile.description}
            onChange={(e) => handleChange('description', e.target.value)}
            rows={3}
            placeholder="AI-native digital marketing and creative agency in Puerto Rico. We build intelligent systems that make businesses impossible to ignore."
            className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary resize-y"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Services & Offerings</label>
          <textarea
            value={profile.services}
            onChange={(e) => handleChange('services', e.target.value)}
            rows={4}
            placeholder="AI web development, DM automation agents, branding, video production, social media management, SEO..."
            className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary resize-y"
          />
          <p className="text-xs text-secondary-foreground mt-1">Separate with commas or list them clearly. This helps the AI answer service questions accurately.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">Communication Tone</label>
            <input
              type="text"
              value={profile.tone}
              onChange={(e) => handleChange('tone', e.target.value)}
              placeholder="professional and friendly"
              className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary"
            />
            <p className="text-xs text-secondary-foreground mt-1">This directly controls how the AI DM Agent speaks.</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Website</label>
            <input
              type="text"
              value={profile.website}
              onChange={(e) => handleChange('website', e.target.value)}
              placeholder="https://wolfpackmediapr.com"
              className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">Contact Email</label>
            <input
              type="email"
              value={profile.contactEmail}
              onChange={(e) => handleChange('contactEmail', e.target.value)}
              placeholder="hello@yourbusiness.com"
              className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Contact Phone</label>
            <input
              type="tel"
              value={profile.contactPhone}
              onChange={(e) => handleChange('contactPhone', e.target.value)}
              placeholder="+1 (787) 555-1234"
              className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary"
            />
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
          {saving ? 'Saving to Supabase...' : 'Save Business Profile'}
        </button>

        {saved && (
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            <span>Saved successfully{isDemoMode ? ' (local + DB if available)' : ''}</span>
          </div>
        )}
      </div>

      <div className="mt-6 text-xs text-secondary-foreground">
        This profile is injected into every AI response. Keep it accurate and up to date. 
        Saving also updates your active bot profile so the AI DM Agent uses the latest tone and knowledge.
      </div>
    </div>
  );
}
