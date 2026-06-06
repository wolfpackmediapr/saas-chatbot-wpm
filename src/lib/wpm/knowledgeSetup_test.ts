/// <reference lib="deno.ns" />

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildKnowledgeSourcePayload,
  getKnowledgeCompletion,
  getKnowledgeSourceTypeLabel,
  normalizeKnowledgeUrl,
  validateKnowledgeSourceInput,
} from './knowledgeSetup.ts';

Deno.test('validateKnowledgeSourceInput requires source type, title, and useful content', () => {
  assertEquals(validateKnowledgeSourceInput({
    source_type: 'faq',
    title: '',
    content_text: '',
  }), {
    title: 'Knowledge title is required.',
    content_text: 'Add FAQ, policy, service, pricing, URL, or other useful knowledge before saving.',
  });

  assertEquals(validateKnowledgeSourceInput({
    source_type: 'url',
    title: 'Website',
    source_url: 'not-a-url',
  }), {
    source_url: 'Source URL must be valid.',
  });

  assertEquals(validateKnowledgeSourceInput({
    source_type: 'manual',
    title: 'Service Menu',
    content_text: 'We offer strategy calls, retainers, and launch packages.',
  }), {});
});

Deno.test('normalizeKnowledgeUrl adds https and removes trailing slash', () => {
  assertEquals(normalizeKnowledgeUrl('wolfpackmediapr.com/services/'), 'https://wolfpackmediapr.com/services');
  assertEquals(normalizeKnowledgeUrl(''), null);
});

Deno.test('buildKnowledgeSourcePayload maps client-owned knowledge to wpm_knowledge_sources', () => {
  assertEquals(buildKnowledgeSourcePayload({
    id: 'knowledge-123',
    source_type: 'faq',
    title: 'Booking FAQs',
    source_url: 'example.com/faq/',
    content_text: 'Q: How do I book? A: Use the booking link.',
    tags: 'booking, faq, lead routing',
    audience: 'prospects',
    priority: 'high',
  }, 'client-123', 'bot-123'), {
    id: 'knowledge-123',
    client_id: 'client-123',
    bot_profile_id: 'bot-123',
    source_type: 'faq',
    title: 'Booking FAQs',
    source_url: 'https://example.com/faq',
    content_text: 'Q: How do I book? A: Use the booking link.',
    status: 'ready',
    metadata: {
      self_setup: true,
      tags: ['booking', 'faq', 'lead routing'],
      audience: 'prospects',
      priority: 'high',
    },
  });
});

Deno.test('getKnowledgeCompletion counts ready knowledge and launch blockers', () => {
  assertEquals(getKnowledgeCompletion([]), {
    readyCount: 0,
    draftCount: 0,
    failedCount: 0,
    totalCount: 0,
    percentComplete: 0,
    blockers: [
      'Add at least one ready knowledge source.',
      'Add either an FAQ/service block or a URL source.',
    ],
    ready: false,
  });

  assertEquals(getKnowledgeCompletion([
    { source_type: 'manual', status: 'ready' },
    { source_type: 'url', status: 'draft' },
    { source_type: 'faq', status: 'failed' },
  ]).ready, true);
});

Deno.test('getKnowledgeSourceTypeLabel returns self-setup labels', () => {
  assertEquals(getKnowledgeSourceTypeLabel('faq'), 'FAQ / common questions');
  assertEquals(getKnowledgeSourceTypeLabel('url'), 'Website URL');
});
