import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { Building2, Save, CheckCircle2, X, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  getOwnedWpmClient,
  updateClientProfile,
  getActiveBotProfile,
  upsertBotProfile,
  WpmClientRecord,
} from '../lib/supabase/wpmClients';
import { BUSINESS_TEMPLATES } from '../lib/businessTemplates';

// ─── Tone options ────────────────────────────────────────────────────────────
const TONE_OPTIONS = [
  'Confident & Bold',
  'Professional & Friendly',
  'Casual & Conversational',
  'Formal & Corporate',
  'Energetic & Playful',
  'Warm & Empathetic',
  'Direct & No-Fluff',
  'Custom...',
] as const;

const TONE_DEFAULT = 'Confident & Bold';

// ─── Service suggestions ─────────────────────────────────────────────────────
const SERVICE_SUGGESTIONS = [
  'AI Web Development',
  'App Development',
  'DM Automation Agents',
  'Chatbot Development',
  'Marketing Automation',
  'Branding & Identity',
  'Video Production',
  'Content Creation',
  'Social Media Management',
  'SEO',
  'Shopify E-Commerce',
  'Custom Platform Development',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseToneField(rawTone: string): { preset: string; custom: string } {
  if (!rawTone) return { preset: TONE_DEFAULT, custom: '' };
  const isKnown = (TONE_OPTIONS as readonly string[]).includes(rawTone);
  if (isKnown && rawTone !== 'Custom...') return { preset: rawTone, custom: '' };
  return { preset: 'Custom...', custom: rawTone };
}

function serializeTone(preset: string, custom: string): string {
  return preset === 'Custom...' ? custom : preset;
}

function parseServices(raw: string): string[] {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

// ─── TagInput ─────────────────────────────────────────────────────────────────
interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

function TagInput({ tags, onChange }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (value: string) => {
    const trimmed = value.trim().replace(/,$/, '').trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputValue('');
  };

  const removeTag = (idx: number) => onChange(tags.filter((_, i) => i !== idx));

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const handleBlur = () => { if (inputValue.trim()) addTag(inputValue); };

  const addSuggestion = (s: string) => {
    if (!tags.includes(s)) onChange([...tags, s]);
    inputRef.current?.focus();
  };

  const unusedSuggestions = SERVICE_SUGGESTIONS.filter(s => !tags.includes(s));

  return (
    <div className="space-y-3">
      <div
        className="min-h-[52px] w-full rounded-lg border border-secondary bg-background px-3 py-2 flex flex-wrap gap-2 cursor-text focus-within:border-primary transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag, idx) => (
          <span
            key={idx}
            className="flex items-center gap-1 bg-primary/15 text-primary text-sm rounded-full px-3 py-0.5 font-medium"
          >
            {tag}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); removeTag(idx); }}
              className="hover:text-primary/60 transition-colors ml-0.5"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={tags.length === 0 ? 'Type a service, press Enter or comma to add...' : ''}
          className="flex-1 min-w-[180px] bg-transparent outline-none text-sm py-0.5"
        />
      </div>
      {unusedSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unusedSuggestions.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => addSuggestion(s)}
              className="text-xs border border-secondary/70 text-secondary-foreground rounded-full px-3 py-1 hover:border-primary hover:text-primary transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
        <span className="text-xs text-secondary-foreground ml-1">— select one to prefill the form, then edit and save</span>
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

// ─── Page ─────────────────────────────────────────────────────────────────────
interface BusinessProfileData {
  name: string;
  description: string;
  serviceTags: string[];
  tonePreset: string;
  toneCustom: string;
  location: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
}

const defaultProfile: BusinessProfileData = {
  name: '',
  description: '',
  serviceTags: [],
  tonePreset: TONE_DEFAULT,
  toneCustom: '',
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
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      setError(null);
      try {
        const ownedClient = await getOwnedWpmClient();
        setClient(ownedClient);
        if (!ownedClient) { setLoading(false); return; }

        const loaded: BusinessProfileData = {
          ...defaultProfile,
          name: ownedClient.name || '',
          description: ownedClient.description || '',
          serviceTags: parseServices(ownedClient.services || ''),
          location: ownedClient.location || '',
          website: ownedClient.website_url || '',
          contactEmail: ownedClient.contact_email || '',
          contactPhone: ownedClient.contact_phone || '',
        };

        const botProfile = await getActiveBotProfile(ownedClient.id);
        if (botProfile?.tone) {
          const { preset, custom } = parseToneField(botProfile.tone);
          loaded.tonePreset = preset;
          loaded.toneCustom = custom;
        }

        setProfile(loaded);
      } catch (err: any) {
        console.error('Failed to load business profile', err);
        setError('Failed to load profile. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  const set = <K extends keyof BusinessProfileData>(field: K, value: BusinessProfileData[K]) => {
    setProfile(prev => ({ ...prev, [field]: value }));
    setActiveTemplate(null);
    setSaved(false);
  };

  const applyTemplate = (templateId: string) => {
    const tpl = BUSINESS_TEMPLATES.find(t => t.id === templateId);
    if (!tpl) return;
    setProfile(prev => ({
      ...prev,
      description: tpl.profile.description,
      serviceTags: tpl.profile.serviceTags,
      tonePreset: tpl.profile.tonePreset,
      toneCustom: tpl.profile.toneCustom,
    }));
    setActiveTemplate(templateId);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!client) return;
    setSaving(true);
    setError(null);

    const toneValue = serializeTone(profile.tonePreset, profile.toneCustom);

    try {
      await updateClientProfile(client.id, {
        name: profile.name,
        description: profile.description || null,
        services: profile.serviceTags.join(', ') || null,
        location: profile.location || null,
        website_url: profile.website || null,
        contact_email: profile.contactEmail || null,
        contact_phone: profile.contactPhone || null,
      });

      await upsertBotProfile(client.id, {
        name: profile.name,
        public_name: profile.name,
        tone: toneValue,
        settings: {
          description: profile.description,
          services: profile.serviceTags.join(', '),
          location: profile.location,
          website: profile.website,
          contact_email: profile.contactEmail,
          contact_phone: profile.contactPhone,
        },
      });

      setClient(prev => prev ? {
        ...prev,
        name: profile.name,
        description: profile.description || null,
        services: profile.serviceTags.join(', ') || null,
        location: profile.location || null,
        website_url: profile.website || null,
        contact_email: profile.contactEmail || null,
        contact_phone: profile.contactPhone || null,
      } : prev);

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      console.error('Save failed', err);
      setError(err.message || 'Failed to save. Please try again.');
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
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-semibold">Business Profile</h1>
        </div>
        <p className="text-secondary-foreground">
          Tell the AI who you are. This information is used in every response and powers your AI DM Agent.
        </p>
      </div>

      {/* Template picker */}
      <TemplatePicker activeId={activeTemplate} onSelect={applyTemplate} />

      {error && (
        <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Form */}
      <div className="bg-secondary/30 border border-secondary rounded-2xl p-8 space-y-8">
        {/* Business Name + Location */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">Business Name</label>
            <input
              type="text"
              value={profile.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Your Business Name"
              className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Location</label>
            <input
              type="text"
              value={profile.location}
              onChange={e => set('location', e.target.value)}
              placeholder="San Juan, Puerto Rico"
              className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Short Description */}
        <div>
          <label className="block text-sm font-medium mb-2">Short Description</label>
          <textarea
            value={profile.description}
            onChange={e => set('description', e.target.value)}
            rows={3}
            placeholder="AI-native digital marketing and creative agency in Puerto Rico. We build intelligent systems that make businesses impossible to ignore."
            className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary resize-y"
          />
        </div>

        {/* Services */}
        <div>
          <label className="block text-sm font-medium mb-2">Services & Offerings</label>
          <TagInput
            tags={profile.serviceTags}
            onChange={tags => set('serviceTags', tags)}
          />
          <p className="text-xs text-secondary-foreground mt-2">Press Enter or comma to add a tag. Click suggestions to quick-add.</p>
        </div>

        {/* Tone + Website */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">Communication Tone</label>
            <select
              value={profile.tonePreset}
              onChange={e => set('tonePreset', e.target.value)}
              className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary"
            >
              {TONE_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {profile.tonePreset === 'Custom...' && (
              <input
                type="text"
                value={profile.toneCustom}
                onChange={e => set('toneCustom', e.target.value)}
                placeholder="Describe your custom tone..."
                className="mt-2 w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary"
              />
            )}
            <p className="text-xs text-secondary-foreground mt-1">Controls how the AI DM Agent speaks.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Website</label>
            <input
              type="text"
              value={profile.website}
              onChange={e => set('website', e.target.value)}
              placeholder="https://yourwebsite.com"
              className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Contact Email + Phone */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">Contact Email</label>
            <input
              type="email"
              value={profile.contactEmail}
              onChange={e => set('contactEmail', e.target.value)}
              placeholder="hello@yourbusiness.com"
              className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Contact Phone</label>
            <input
              type="tel"
              value={profile.contactPhone}
              onChange={e => set('contactPhone', e.target.value)}
              placeholder="+1 (787) 555-1234"
              className="w-full rounded-lg border border-secondary bg-background px-4 py-3 outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving || !client}
          className={cn(
            'flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all',
            'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-70'
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
        Saving also updates your active bot profile so the AI DM Agent uses the latest tone and knowledge.
      </div>
    </div>
  );
}
