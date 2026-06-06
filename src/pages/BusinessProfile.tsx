import React, { useState, useEffect } from 'react';
import { Building2, Save, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';

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

  useEffect(() => {
    // Load from localStorage (replace with Supabase later)
    const savedProfile = localStorage.getItem('wpm-business-profile');
    if (savedProfile) {
      setProfile(JSON.parse(savedProfile));
    }
  }, []);

  const handleChange = (field: keyof BusinessProfileData, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      localStorage.setItem('wpm-business-profile', JSON.stringify(profile));
      // TODO: Save to Supabase wpm_bot_profiles table
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
          <Building2 className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-semibold">Business Profile</h1>
        </div>
        <p className="text-secondary-foreground">
          Tell the AI who you are. This information is used in every response.
        </p>
      </div>

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
          <p className="text-xs text-secondary-foreground mt-1">Separate with commas or list them clearly.</p>
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
          {saving ? 'Saving...' : 'Save Business Profile'}
        </button>

        {saved && (
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            <span>Saved successfully</span>
          </div>
        )}
      </div>

      <div className="mt-6 text-xs text-secondary-foreground">
        This profile is injected into every AI response. Keep it accurate and up to date.
      </div>
    </div>
  );
}
