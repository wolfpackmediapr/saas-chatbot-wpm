/// <reference lib="deno.ns" />

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildAgentInstructionPayload,
  buildAgentProfilePayload,
  getAgentSetupCompletion,
  getAgentTemplate,
  listAgentTemplates,
  validateAgentSetupInput,
} from './agentSetup.ts';

Deno.test('listAgentTemplates includes WPM self-setup verticals', () => {
  assertEquals(listAgentTemplates().map((template) => template.key), [
    'restaurant-hospitality',
    'beauty-spa',
    'medical-dental',
    'home-services',
    'professional-services',
    'ecommerce-product',
    'custom',
  ]);
});

Deno.test('getAgentTemplate returns defaults for an industry template', () => {
  const template = getAgentTemplate('restaurant-hospitality');

  assertEquals(template?.tone, 'warm, concise, hospitality-first');
  assertEquals(template?.leadFields, ['name', 'phone', 'party_size', 'date_time', 'service_interest']);
  assertEquals(template?.emergencyKeywords, ['allergy', 'urgent', 'manager']);
});

Deno.test('validateAgentSetupInput requires template, agent name, instructions, and valid booking URL', () => {
  assertEquals(validateAgentSetupInput({
    template_key: '',
    name: '',
    system_prompt: '',
    booking_url: 'not-a-url',
  }), {
    template_key: 'Choose an agent template.',
    name: 'Agent name is required.',
    system_prompt: 'Core instructions are required.',
    booking_url: 'Booking URL must be valid.',
  });

  assertEquals(validateAgentSetupInput({
    template_key: 'custom',
    name: 'AI Receptionist',
    system_prompt: 'Answer questions and qualify leads.',
    booking_url: 'https://example.com/book',
  }), {});
});

Deno.test('buildAgentProfilePayload maps client-owned config to wpm_bot_profiles', () => {
  assertEquals(buildAgentProfilePayload({
    id: 'profile-123',
    template_key: 'professional-services',
    name: 'Consultation Agent',
    public_name: 'WolfPack Assistant',
    tone: 'sharp and direct',
    language: 'en/es',
    response_length: 'concise',
    booking_url: 'wolfpackmediapr.com/book',
    handoff_contact: 'ops@example.com',
    system_prompt: 'Qualify consultation requests.',
  }, 'client-123'), {
    id: 'profile-123',
    client_id: 'client-123',
    name: 'Consultation Agent',
    public_name: 'WolfPack Assistant',
    template_key: 'professional-services',
    model_provider: 'openai',
    model_name: 'gpt-4.1-mini',
    tone: 'sharp and direct',
    language: 'en/es',
    response_length: 'concise',
    booking_url: 'https://wolfpackmediapr.com/book',
    handoff_contact: 'ops@example.com',
    is_active: true,
    settings: {
      self_setup: true,
    },
  });
});

Deno.test('buildAgentInstructionPayload maps rules and lead fields to wpm_bot_instructions', () => {
  assertEquals(buildAgentInstructionPayload({
    instruction_id: 'instructions-123',
    template_key: 'home-services',
    name: 'Quote Agent',
    system_prompt: 'Collect quote requests.',
    business_summary: 'ACME fixes homes.',
    faq_instructions: 'Answer service area questions.',
    lead_qualification_instructions: 'Ask for address and urgency.',
    handoff_rules: 'Escalate urgent issues.',
    never_say_rules: 'Never guarantee exact pricing.',
    emergency_keywords: 'flood, fire, emergency',
    lead_fields: 'name, phone, address, urgency',
  }, 'profile-123'), {
    id: 'instructions-123',
    bot_profile_id: 'profile-123',
    system_prompt: 'Collect quote requests.',
    business_summary: 'ACME fixes homes.',
    faq_instructions: 'Answer service area questions.',
    lead_qualification_instructions: 'Ask for address and urgency.',
    handoff_rules: 'Escalate urgent issues.',
    never_say_rules: 'Never guarantee exact pricing.',
    emergency_keywords: ['flood', 'fire', 'emergency'],
    lead_fields: ['name', 'phone', 'address', 'urgency'],
    version: 1,
    is_active: true,
  });
});

Deno.test('getAgentSetupCompletion returns blockers and readiness', () => {
  assertEquals(getAgentSetupCompletion({ name: 'Agent' }), {
    completed: 1,
    total: 7,
    percentComplete: 14,
    blockers: [
      'Template is required.',
      'Core instructions are required.',
      'Tone is required.',
      'Language is required.',
      'Lead qualification rules are required.',
      'Handoff rules are required.',
    ],
    ready: false,
  });

  assertEquals(getAgentSetupCompletion({
    template_key: 'custom',
    name: 'Agent',
    system_prompt: 'Help users.',
    tone: 'direct',
    language: 'en',
    lead_qualification_instructions: 'Ask for name and email.',
    handoff_rules: 'Escalate angry users.',
  }).ready, true);
});
