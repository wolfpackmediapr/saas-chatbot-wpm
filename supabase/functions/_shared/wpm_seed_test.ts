import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildWpmSeedConfig,
  buildSeedClientPayload,
  buildSeedChannelPayload,
  buildSeedBotProfilePayload,
  buildSeedInstructionsPayload,
  buildSeedKnowledgePayloads,
  buildSeedIntegrationPayload,
} from './wpm_seed.ts';

Deno.test('buildWpmSeedConfig defaults to WPM internal test client and test channel placeholder', () => {
  const config = buildWpmSeedConfig({});

  assertEquals(config.clientSlug, 'wpm-internal-test');
  assertEquals(config.clientName, 'WolfPack Media Internal Test');
  assertEquals(config.channelType, 'test');
  assertEquals(config.provider, 'woztell');
  assertEquals(config.providerChannelId, 'woztell-channel-placeholder');
  assertEquals(config.botTemplateKey, 'wpm-ai-receptionist');
});

Deno.test('buildSeedClientPayload creates productized WPM test client row', () => {
  assertEquals(buildSeedClientPayload(buildWpmSeedConfig({})), {
    name: 'WolfPack Media Internal Test',
    slug: 'wpm-internal-test',
    industry: 'AI marketing / automation agency',
    website_url: 'https://wolfpackmediapr.com',
    contact_name: 'Wilfre Carrasquillo',
    contact_email: 'hello@wolfpackmediapr.com',
    contact_phone: null,
    timezone: 'America/Puerto_Rico',
    status: 'setup',
    notes: 'Internal pilot client for validating the WolfPack AI DM Agent bridge.',
  });
});

Deno.test('buildSeedChannelPayload maps Woztell channel identifiers for routing', () => {
  const payload = buildSeedChannelPayload('client-uuid', buildWpmSeedConfig({
    channelType: 'instagram',
    providerChannelId: 'woztell-channel-123',
    providerBotId: 'woztell-bot-999',
    externalPageId: 'ig-page-123',
  }));

  assertEquals(payload.client_id, 'client-uuid');
  assertEquals(payload.channel_type, 'instagram');
  assertEquals(payload.provider, 'woztell');
  assertEquals(payload.provider_channel_id, 'woztell-channel-123');
  assertEquals(payload.provider_bot_id, 'woztell-bot-999');
  assertEquals(payload.external_page_id, 'ig-page-123');
  assertEquals(payload.is_active, true);
});

Deno.test('buildSeedBotProfilePayload and instructions define the WPM AI receptionist behavior', () => {
  const config = buildWpmSeedConfig({ bookingUrl: 'https://wolfpackmediapr.com/book-a-call' });
  const bot = buildSeedBotProfilePayload('client-uuid', config);
  const instructions = buildSeedInstructionsPayload('bot-uuid', config);

  assertEquals(bot.client_id, 'client-uuid');
  assertEquals(bot.template_key, 'wpm-ai-receptionist');
  assertEquals(bot.model_provider, 'openai');
  assertEquals(bot.model_name, 'gpt-4.1-mini');
  assertEquals(bot.booking_url, 'https://wolfpackmediapr.com/book-a-call');
  assertStringIncludes(instructions.system_prompt, 'WolfPack Media');
  assertStringIncludes(instructions.lead_qualification_instructions ?? '', 'name');
  assertStringIncludes(instructions.handoff_rules ?? '', 'Book a call');
});

Deno.test('buildSeedKnowledgePayloads creates ready knowledge rows for live smoke tests', () => {
  const rows = buildSeedKnowledgePayloads('client-uuid', 'bot-uuid', buildWpmSeedConfig({}));

  assertEquals(rows.length, 3);
  assertEquals(rows.every((row) => row.client_id === 'client-uuid'), true);
  assertEquals(rows.every((row) => row.bot_profile_id === 'bot-uuid'), true);
  assertEquals(rows.every((row) => row.status === 'ready'), true);
  assertEquals(rows.map((row) => row.title), [
    'WPM Service Positioning',
    'WPM AI DM Agent Offer',
    'Live Test Script',
  ]);
});

Deno.test('buildSeedIntegrationPayload creates inactive placeholder until Zapier URL secret exists', () => {
  const payload = buildSeedIntegrationPayload('client-uuid', buildWpmSeedConfig({}));

  assertEquals(payload.client_id, 'client-uuid');
  assertEquals(payload.provider, 'zapier');
  assertEquals(payload.integration_type, 'zapier_webhook');
  assertEquals(payload.secret_reference, 'WPM_ZAPIER_QUALIFIED_LEAD_URL');
  assertEquals(payload.is_active, false);
});
