/// <reference lib="deno.ns" />
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildWpmSystemPrompt, buildWpmAssistantMessages } from './wpm_prompt.ts';
import type { WpmBotContext } from './wpm_prompt.ts';

const mockContext: WpmBotContext = {
  client: {
    id: 'client-123',
    name: 'WolfPack Dental',
    industry: 'dental',
    timezone: 'America/Puerto_Rico',
    website_url: 'https://example.com',
  },
  botProfile: {
    id: 'bot-1',
    public_name: 'Luna',
    tone: 'friendly-professional',
    language: 'en',
    response_length: 'balanced',
    booking_url: 'https://book.example.com',
    handoff_contact: 'text 787-555-0199',
    model_provider: 'openai',
    model_name: 'gpt-4o-mini',
  },
  instructions: {
    system_prompt: 'Be helpful and book appointments when possible.',
    business_summary: 'We offer teeth whitening and cleanings.',
    faq_instructions: 'Whitening is $299.',
    lead_qualification_instructions: 'Ask for name, phone, and preferred service.',
    handoff_rules: 'If they ask for medical advice, hand off.',
    never_say_rules: 'Do not promise exact appointment times without checking.',
    emergency_keywords: ['pain', 'emergency'],
    lead_fields: ['name', 'phone', 'service'],
  },
  knowledge: [
    { title: 'Whitening', content_text: 'Teeth whitening takes 60 minutes.' },
  ],
};

Deno.test('buildWpmSystemPrompt includes all key sections and knowledge', () => {
  const prompt = buildWpmSystemPrompt(mockContext);

  assertStringIncludes(prompt, 'WolfPack Dental');
  assertStringIncludes(prompt, 'Luna');
  assertStringIncludes(prompt, 'Teeth whitening takes 60 minutes.');
  assertStringIncludes(prompt, 'Be helpful and book appointments');
  assertStringIncludes(prompt, 'Whitening is $299.');
});

Deno.test('buildWpmAssistantMessages produces system + history + new user message', () => {
  const recent = [
    { role: 'user' as const, content: 'Hi' },
    { role: 'assistant' as const, content: 'Hello!' },
  ];
  const messages = buildWpmAssistantMessages(mockContext, recent, 'Do you do whitening?');

  assertEquals(messages[0].role, 'system');
  assertEquals(messages[messages.length - 1].content, 'Do you do whitening?');
  assertEquals(messages.length, 4); // system + 2 history + 1 user
});
