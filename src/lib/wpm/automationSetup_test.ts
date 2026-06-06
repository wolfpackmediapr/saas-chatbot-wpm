/// <reference lib="deno.ns" />

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildIntegrationPayload,
  getAutomationCompletion,
  getIntegrationTypeLabel,
  normalizeAutomationInput,
  validateAutomationInput,
} from './automationSetup.ts';

Deno.test('validateAutomationInput requires integration type, name, and destination without exposing raw secrets', () => {
  assertEquals(validateAutomationInput({
    integration_type: 'email',
    name: '',
    webhook_url: '',
    email: '',
  }), {
    name: 'Automation name is required.',
    webhook_url: 'Provide a Zapier, n8n, custom webhook URL, or email address for this automation.',
  });

  assertEquals(validateAutomationInput({
    integration_type: 'zapier_webhook',
    name: 'New Lead to CRM',
    webhook_url: 'https://hooks.zapier.com/hooks/catch/123/abc/',
  }), {});

  // Block raw secret-like tokens
  assertEquals(validateAutomationInput({
    integration_type: 'custom_webhook',
    name: 'Internal',
    webhook_url: 'https://example.com/hook',
    secret: 'sk_live_xxx',
  }), {
    secret: 'Do not paste secrets or API keys in the browser. Use secret_reference for server-side storage.',
  });
});

Deno.test('normalizeAutomationInput trims and masks sensitive-looking values', () => {
  const normalized = normalizeAutomationInput({
    integration_type: 'email',
    name: ' Owner Alerts ',
    email: '  ops@wolfpackmediapr.com ',
    field_map: ' name, phone, service_interest ',
  });

  assertEquals(normalized.name, 'Owner Alerts');
  assertEquals(normalized.email, 'ops@wolfpackmediapr.com');
  assertEquals(normalized.field_map, ['name', 'phone', 'service_interest']);
});

Deno.test('buildIntegrationPayload maps browser-safe automation config to wpm_integrations', () => {
  assertEquals(buildIntegrationPayload({
    id: 'int-123',
    integration_type: 'zapier_webhook',
    name: 'Lead to HoneyBook',
    webhook_url: 'https://hooks.zapier.com/hooks/catch/999/lead/',
    field_map: 'name,phone,service',
    secret_reference: 'zapier_lead_secret',
  }, 'client-123'), {
    id: 'int-123',
    client_id: 'client-123',
    provider: 'zapier',
    integration_type: 'zapier_webhook',
    name: 'Lead to HoneyBook',
    secret_reference: 'zapier_lead_secret',
    webhook_url_encrypted: null, // will be handled server-side
    field_map: { fields: ['name', 'phone', 'service'] },
    is_active: true,
    metadata: {
      self_setup: true,
      secret_storage: 'server_side_only',
      webhook_url: 'https://hooks.zapier.com/hooks/catch/999/lead/', // stored for reference but encrypted on backend
      email: null,
    },
  });
});

Deno.test('getAutomationCompletion counts active automations and MVP readiness', () => {
  assertEquals(getAutomationCompletion([]), {
    activeCount: 0,
    totalCount: 0,
    percentComplete: 0,
    blockers: ['Add at least one automation destination (Zapier, n8n, custom webhook, or email).'],
    ready: false,
  });

  assertEquals(getAutomationCompletion([
    { integration_type: 'zapier_webhook', is_active: true },
    { integration_type: 'email', is_active: true },
  ]).ready, true);
});

Deno.test('getIntegrationTypeLabel returns human labels for self-setup', () => {
  assertEquals(getIntegrationTypeLabel('zapier_webhook'), 'Zapier Webhook');
  assertEquals(getIntegrationTypeLabel('email'), 'Email Notification');
});
