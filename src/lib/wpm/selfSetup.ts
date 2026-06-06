export interface BusinessProfileInput {
  id?: string;
  name: string;
  industry?: string;
  website_url?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  timezone?: string;
  preferred_language?: string;
  brand_voice?: string;
}

export interface BusinessProfileValidationErrors {
  name?: string;
  website_url?: string;
  contact_email?: string;
}

export interface BusinessProfileCompletion {
  completed: number;
  total: number;
  percentComplete: number;
  blockers: string[];
  ready: boolean;
}

export interface ClientUpsertPayload {
  id?: string;
  owner_user_id: string;
  name: string;
  slug: string;
  industry: string | null;
  website_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  timezone: string;
  status: 'setup';
  notes: string | null;
}

const DEFAULT_TIMEZONE = 'America/Puerto_Rico';

function clean(value?: string): string {
  return value?.trim() ?? '';
}

export function slugifyBusinessName(name: string): string {
  return clean(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function normalizeWebsiteUrl(url?: string): string | null {
  const value = clean(url);
  if (!value) return null;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/$/, '');
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.includes('.');
  } catch {
    return false;
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateBusinessProfileInput(input: Partial<BusinessProfileInput>): BusinessProfileValidationErrors {
  const errors: BusinessProfileValidationErrors = {};

  if (!clean(input.name)) {
    errors.name = 'Business name is required.';
  }

  const websiteUrl = normalizeWebsiteUrl(input.website_url);
  if (websiteUrl && !isValidUrl(websiteUrl)) {
    errors.website_url = 'Website must be a valid URL.';
  }

  const email = clean(input.contact_email);
  if (email && !isValidEmail(email)) {
    errors.contact_email = 'Email must be valid.';
  }

  return errors;
}

export function buildClientNotes(input: BusinessProfileInput): string | null {
  const lines = [
    clean(input.preferred_language) ? `Preferred language: ${clean(input.preferred_language)}` : '',
    clean(input.brand_voice) ? `Brand voice: ${clean(input.brand_voice)}` : '',
  ].filter(Boolean);

  return lines.length > 0 ? lines.join('\n') : null;
}

export function buildClientUpsertPayload(input: BusinessProfileInput, ownerUserId: string): ClientUpsertPayload {
  const name = clean(input.name);
  const payload: ClientUpsertPayload = {
    owner_user_id: ownerUserId,
    name,
    slug: slugifyBusinessName(name),
    industry: clean(input.industry) || null,
    website_url: normalizeWebsiteUrl(input.website_url),
    contact_name: clean(input.contact_name) || null,
    contact_email: clean(input.contact_email) || null,
    contact_phone: clean(input.contact_phone) || null,
    timezone: clean(input.timezone) || DEFAULT_TIMEZONE,
    status: 'setup',
    notes: buildClientNotes(input),
  };

  if (input.id) {
    payload.id = input.id;
  }

  return payload;
}

export function getBusinessProfileCompletion(input: Partial<BusinessProfileInput>): BusinessProfileCompletion {
  const checks = [
    { ok: Boolean(clean(input.name)), blocker: 'Business name is required.' },
    { ok: Boolean(clean(input.industry)), blocker: 'Industry is required.' },
    { ok: Boolean(clean(input.website_url)), blocker: 'Website is required.' },
    { ok: Boolean(clean(input.contact_email)), blocker: 'Contact email is required.' },
    { ok: Boolean(clean(input.timezone)), blocker: 'Timezone is required.' },
    { ok: Boolean(clean(input.brand_voice)), blocker: 'Brand voice is required.' },
  ];

  const completed = checks.filter((check) => check.ok).length;
  const blockers = checks.filter((check) => !check.ok).map((check) => check.blocker);

  return {
    completed,
    total: checks.length,
    percentComplete: Math.round((completed / checks.length) * 100),
    blockers,
    ready: blockers.length === 0 && Object.keys(validateBusinessProfileInput(input)).length === 0,
  };
}
