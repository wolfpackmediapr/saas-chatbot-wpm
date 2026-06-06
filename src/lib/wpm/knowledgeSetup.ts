export type KnowledgeSourceType = 'manual' | 'file' | 'url' | 'faq' | 'notion' | 'google_doc';
export type KnowledgeSourceStatus = 'draft' | 'processing' | 'ready' | 'failed' | 'archived';
export type KnowledgePriority = 'low' | 'normal' | 'high';

export interface KnowledgeSourceInput {
  id?: string;
  source_type: KnowledgeSourceType;
  title: string;
  source_url?: string;
  content_text?: string;
  tags?: string | string[];
  audience?: string;
  priority?: KnowledgePriority;
}

export interface KnowledgeSourceValidationErrors {
  source_type?: string;
  title?: string;
  source_url?: string;
  content_text?: string;
}

export interface KnowledgeSourcePayload {
  id?: string;
  client_id: string;
  bot_profile_id: string | null;
  source_type: KnowledgeSourceType;
  title: string;
  source_url: string | null;
  content_text: string | null;
  status: 'ready';
  metadata: {
    self_setup: true;
    tags: string[];
    audience: string | null;
    priority: KnowledgePriority;
  };
}

export interface KnowledgeCompletionSource {
  source_type: KnowledgeSourceType;
  status: KnowledgeSourceStatus;
}

export interface KnowledgeCompletion {
  readyCount: number;
  draftCount: number;
  failedCount: number;
  totalCount: number;
  percentComplete: number;
  blockers: string[];
  ready: boolean;
}

const SOURCE_TYPE_LABELS: Record<KnowledgeSourceType, string> = {
  manual: 'Manual knowledge block',
  file: 'Uploaded file',
  url: 'Website URL',
  faq: 'FAQ / common questions',
  notion: 'Notion page',
  google_doc: 'Google Doc',
};

function clean(value?: string): string {
  return value?.trim() ?? '';
}

function splitList(value?: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value.map(clean).filter(Boolean);
  }

  return clean(value)
    .split(',')
    .map(clean)
    .filter(Boolean);
}

function hasUsableKnowledge(input: Partial<KnowledgeSourceInput>): boolean {
  return Boolean(clean(input.content_text) || clean(input.source_url));
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.includes('.');
  } catch {
    return false;
  }
}

export function normalizeKnowledgeUrl(url?: string): string | null {
  const value = clean(url);
  if (!value) return null;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/$/, '');
}

export function getKnowledgeSourceTypeLabel(sourceType: KnowledgeSourceType): string {
  return SOURCE_TYPE_LABELS[sourceType];
}

export function validateKnowledgeSourceInput(input: Partial<KnowledgeSourceInput>): KnowledgeSourceValidationErrors {
  const errors: KnowledgeSourceValidationErrors = {};

  if (!clean(input.source_type)) {
    errors.source_type = 'Choose a knowledge source type.';
  }

  if (!clean(input.title)) {
    errors.title = 'Knowledge title is required.';
  }

  if (!hasUsableKnowledge(input)) {
    errors.content_text = 'Add FAQ, policy, service, pricing, URL, or other useful knowledge before saving.';
  }

  const sourceUrl = normalizeKnowledgeUrl(input.source_url);
  if (sourceUrl && !isValidUrl(sourceUrl)) {
    errors.source_url = 'Source URL must be valid.';
  }

  return errors;
}

export function buildKnowledgeSourcePayload(
  input: KnowledgeSourceInput,
  clientId: string,
  botProfileId?: string | null,
): KnowledgeSourcePayload {
  const payload: KnowledgeSourcePayload = {
    client_id: clientId,
    bot_profile_id: botProfileId ?? null,
    source_type: input.source_type,
    title: clean(input.title),
    source_url: normalizeKnowledgeUrl(input.source_url),
    content_text: clean(input.content_text) || null,
    status: 'ready',
    metadata: {
      self_setup: true,
      tags: splitList(input.tags),
      audience: clean(input.audience) || null,
      priority: input.priority ?? 'normal',
    },
  };

  if (input.id) payload.id = input.id;

  return payload;
}

export function getKnowledgeCompletion(sources: KnowledgeCompletionSource[]): KnowledgeCompletion {
  const totalCount = sources.length;
  const readyCount = sources.filter((source) => source.status === 'ready').length;
  const draftCount = sources.filter((source) => source.status === 'draft' || source.status === 'processing').length;
  const failedCount = sources.filter((source) => source.status === 'failed').length;
  const hasUsefulType = sources.some((source) => source.status === 'ready' && ['faq', 'manual', 'url'].includes(source.source_type));
  const blockers: string[] = [];

  if (readyCount === 0) {
    blockers.push('Add at least one ready knowledge source.');
  }

  if (!hasUsefulType) {
    blockers.push('Add either an FAQ/service block or a URL source.');
  }

  return {
    readyCount,
    draftCount,
    failedCount,
    totalCount,
    percentComplete: totalCount === 0 ? 0 : Math.round((readyCount / totalCount) * 100),
    blockers,
    ready: blockers.length === 0,
  };
}
