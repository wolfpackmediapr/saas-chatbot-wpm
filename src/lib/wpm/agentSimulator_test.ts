/// <reference lib="deno.ns" />

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildTestMessagePayload,
  simulateAgentReply,
  extractLeadFromTest,
  getSimulatorCompletion,
  validateTestInput,
} from './agentSimulator.ts';

Deno.test('validateTestInput requires channel and message content', () => {
  assertEquals(validateTestInput({ channel_type: '', message: '' }), {
    channel_type: 'Select a test channel.',
    message: 'Enter a test customer message.',
  });
});

Deno.test('buildTestMessagePayload creates a safe test conversation record', () => {
  const payload = buildTestMessagePayload({
    channel_type: 'whatsapp',
    message: 'Hi, do you do teeth whitening? My name is Maria, phone 787-555-1212',
    customer_name: 'Maria Lopez',
  }, 'client-123');

  assertEquals(payload.client_id, 'client-123');
  assertEquals(payload.source_channel, 'whatsapp');
  assertEquals(payload.test_mode, true);
  assertEquals(payload.initial_message, 'Hi, do you do teeth whitening? My name is Maria, phone 787-555-1212');
});

Deno.test('simulateAgentReply returns a safe preview reply and lead signals without real AI call in test mode', () => {
  const result = simulateAgentReply({
    message: 'Hi, interested in the whitening special for my wife',
    business_name: 'WolfPack Dental',
    agent_name: 'Luna',
    knowledge_snippets: ['We offer teeth whitening for $299.'],
  });

  assertEquals(result.reply.includes('Luna'), true);
  assertEquals(result.reply.includes('whitening'), true);
  assertEquals(result.lead_signals.intent, 'service_inquiry');
  assertEquals(result.lead_signals.service_interest, 'whitening');
  assertEquals(result.should_trigger_automation, true);
});

Deno.test('extractLeadFromTest pulls structured lead data from test message + reply', () => {
  const lead = extractLeadFromTest({
    message: 'Hi, my name is Carlos, I need a cleaning next week. carlos@demo.com 939-222-3333',
    agent_reply: 'Great, we have availability. Would you like to book?',
  });

  assertEquals(lead.full_name, 'Carlos');
  assertEquals(lead.email, 'carlos@demo.com');
  assertEquals(lead.phone, '939-222-3333');
  assertEquals(lead.service_interest.toLowerCase().includes('cleaning'), true);
});

Deno.test('getSimulatorCompletion tracks test runs and readiness for launch smoke test', () => {
  assertEquals(getSimulatorCompletion([]), {
    testsRun: 0,
    successful: 0,
    percentComplete: 0,
    blockers: ['Run at least one successful test conversation and confirm a lead + automation was triggered.'],
    ready: false,
  });
});
