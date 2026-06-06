import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildWpmAssistantMessages,
  buildWpmSystemPrompt,
  type WpmBotContext,
} from './wpm_prompt.ts';

const context: WpmBotContext = {
  client: {
    id: 'client-uuid',
    name: 'Demo Restaurant',
    industry: 'restaurant',
    timezone: 'America/Puerto_Rico',
    website_url: 'https://example.com',
  },
  botProfile: {
    id: 'bot-profile-uuid',
    public_name: 'Demo Concierge',
    tone: 'premium, direct, friendly',
    language: 'en',
    response_length: 'concise',
    booking_url: 'https://example.com/book',
    handoff_contact: 'team@example.com',
    model_provider: 'openai',
    model_name: 'gpt-4.1-mini',
  },
  instructions: {
    system_prompt: 'Represent the business accurately and never invent availability.',
    business_summary: 'Upscale Puerto Rico restaurant focused on private events and catering.',
    faq_instructions: 'Hours: Tue-Sun 11am-9pm. Closed Monday.',
    lead_qualification_instructions: 'Collect name, phone, date, party size, and service interest.',
    handoff_rules: 'Escalate urgent complaints or booking changes.',
    never_say_rules: 'Never promise a reservation is confirmed without staff approval.',
    emergency_keywords: ['allergy', 'refund'],
    lead_fields: ['name', 'phone', 'date', 'party_size'],
  },
  knowledge: [
    { title: 'Menu summary', content_text: 'Popular services: catering, private dining, brunch events.' },
  ],
};

Deno.test('buildWpmSystemPrompt assembles client, instruction, lead, handoff, and knowledge context', () => {
  const prompt = buildWpmSystemPrompt(context);

  assertStringIncludes(prompt, 'Demo Restaurant');
  assertStringIncludes(prompt, 'Demo Concierge');
  assertStringIncludes(prompt, 'Represent the business accurately');
  assertStringIncludes(prompt, 'Collect name, phone, date, party size');
  assertStringIncludes(prompt, 'Never promise a reservation is confirmed');
  assertStringIncludes(prompt, 'Popular services: catering');
  assertStringIncludes(prompt, 'https://example.com/book');
});

Deno.test('buildWpmAssistantMessages creates OpenAI-compatible chat messages with recent conversation history', () => {
  const messages = buildWpmAssistantMessages(context, [
    { role: 'user', content: 'Do you do private events?' },
    { role: 'assistant', content: 'Yes. What date and party size are you considering?' },
  ], 'I need catering for 30 people this Friday.');

  assertEquals(messages.at(0)?.role, 'system');
  assertEquals(messages.at(-1), {
    role: 'user',
    content: 'I need catering for 30 people this Friday.',
  });
  assertEquals(messages.slice(1), [
    { role: 'user', content: 'Do you do private events?' },
    { role: 'assistant', content: 'Yes. What date and party size are you considering?' },
    { role: 'user', content: 'I need catering for 30 people this Friday.' },
  ]);
});
