export type IntegrationType = 'zapier_webhook' | 'crm' | 'calendar' | 'email' | 'slack' | 'custom_webhook';
export type AutomationProvider = 'zapier' | 'n8n' | 'email' | 'crm' | 'slack' | 'custom';

export interface AutomationInput {
  id?: string;
  integration_type?: IntegrationType;
  provider?: AutomationProvider;
  name: string;
  webhook_url?: string;
  email?: string;
  field_map?: string | string[];
  secret_reference?: string;
  secret?: string; // blocked in browser
}

export interface AutomationValidationErrors {
  integration_type?: string;
  name?: string;
  webhook_url?: string;
  email?: string;
  secret?: string;
}

export interface AutomationPayload {
  id?: string;
  client_id: string;
  provider: AutomationProvider;
  integration_type: IntegrationType;
  name: string;
  secret_reference: string | null;
  webhook_url_encrypted: string | null;
  field_map: { fields: string[] };
  is_active: true;
  metadata: {
    self_setup: true;
    secret_storage: 'server_side_only';
    webhook_url: string | null;
    email: string | null;
  };
}

export interface AutomationCompletionSource {
  integration_type: IntegrationType;
  is_active: boolean;
}

export interface AutomationCompletion {
  activeCount: number;
  totalCount: number;
  percentComplete: number;
  blockers: string[];
  ready: boolean;
}

const INTEGRATION_LABELS: Record<IntegrationType, string> = {
  zapier_webhook: 'Zapier Webhook',
  crm: 'CRM',
  calendar: 'Calendar Booking',
  email: 'Email Notification',
  slack: 'Slack',
  custom_webhook: 'Custom Webhook',
};

function clean(value?: string): string {
  return value?.trim() ?? '';
}

function splitFields(value?: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value.map(clean).filter(Boolean);
  }
  return clean(value)
    .split(',')
    .map(clean)
    .filter(Boolean);
}

function detectProvider(type: IntegrationType, explicit?: AutomationProvider): AutomationProvider {
  if (explicit) return explicit;
  if (type === 'zapier_webhook') return 'zapier';
  if (type === 'email') return 'email';
  if (type === 'custom_webhook') return 'custom';
  if (type === 'crm') return 'crm';
  if (type === 'calendar') return 'crm';
  if (type === 'slack') return 'slack';
  return 'custom';
}

function hasDestination(input: Partial<AutomationInput>): boolean {
  return Boolean(clean(input.webhook_url) || clean(input.email));
}

function isSecretLike(value?: string): boolean {
  const v = clean(value).toLowerCase();
  return v.includes('sk_') || v.includes('secret') || v.includes('token') || v.includes('key') || v.startsWith('bearer ');
}

export function getIntegrationTypeLabel(integrationType: IntegrationType): string {
  return INTEGRATION_LABELS[integrationType];
}

export function normalizeAutomationInput(input: Partial<AutomationInput>) {
  const type = input.integration_type || 'email';
  return {
    integration_type: type,
    provider: detectProvider(type, input.provider),
    name: clean(input.name),
    webhook_url: clean(input.webhook_url),
    email: clean(input.email),
    field_map: splitFields(input.field_map),
    secret_reference: clean(input.secret_reference),
  };
}

export function validateAutomationInput(input: Partial<AutomationInput>): AutomationValidationErrors {
  const normalized = normalizeAutomationInput(input);
  const errors: AutomationValidationErrors = {};

  if (!input.integration_type) {
    errors.integration_type = 'Choose an automation destination type.';
  }

  if (!normalized.name) {
    errors.name = 'Automation name is required.';
  }

  if (!hasDestination(input)) {
    errors.webhook_url = 'Provide a Zapier, n8n, custom webhook URL, or email address for this automation.';
  }

  if (input.secret && isSecretLike(input.secret)) {
    errors.secret = 'Do not paste secrets or API keys in the browser. Use secret_reference for server-side storage.';
  }

  return errors;
}

export function buildIntegrationPayload(input: AutomationInput, clientId: string): AutomationPayload {
  const normalized = normalizeAutomationInput(input);
  const payload: AutomationPayload = {
    client_id: clientId,
    provider: normalized.provider,
    integration_type: normalized.integration_type,
    name: normalized.name,
    secret_reference: normalized.secret_reference || null,
    webhook_url_encrypted: null,
    field_map: { fields: normalized.field_map },
    is_active: true,
    metadata: {
      self_setup: true,
      secret_storage: 'server_side_only',
      webhook_url: normalized.webhook_url || null,
      email: normalized.email || null,
    },
  };

  if (input.id) payload.id = input.id;

  return payload;
}

export function getAutomationCompletion(sources: AutomationCompletionSource[]): AutomationCompletion {
  const totalCount = sources.length;
  const activeCount = sources.filter((s) => s.is_active).length;
  const blockers: string[] = [];

  if (activeCount === 0) {
    blockers.push('Add at least one automation destination (Zapier, n8n, custom webhook, or email).');
  }

  return {
    activeCount,
    totalCount,
    percentComplete: totalCount === 0 ? 0 : Math.round((activeCount / totalCount) * 100),
    blockers,
    ready: blockers.length === 0,
  };
}
