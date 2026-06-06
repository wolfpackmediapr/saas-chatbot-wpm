/// <reference lib="deno.ns" />

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildClientUpsertPayload,
  getBusinessProfileCompletion,
  slugifyBusinessName,
  validateBusinessProfileInput,
} from './selfSetup.ts';

Deno.test('slugifyBusinessName creates stable client slugs', () => {
  assertEquals(slugifyBusinessName('WolfPack Media PR, LLC'), 'wolfpack-media-pr-llc');
  assertEquals(slugifyBusinessName('  Café Niño & Co.  '), 'cafe-nino-co');
});

Deno.test('validateBusinessProfileInput requires a business name and valid website/email formats', () => {
  assertEquals(validateBusinessProfileInput({ name: '' }).name, 'Business name is required.');
  assertEquals(validateBusinessProfileInput({ name: 'Acme', website_url: 'not-a-url' }).website_url, 'Website must be a valid URL.');
  assertEquals(validateBusinessProfileInput({ name: 'Acme', contact_email: 'bad-email' }).contact_email, 'Email must be valid.');
  assertEquals(validateBusinessProfileInput({ name: 'Acme', website_url: 'https://example.com', contact_email: 'owner@example.com' }), {});
});

Deno.test('buildClientUpsertPayload creates owned setup client payload without exposing secrets', () => {
  assertEquals(buildClientUpsertPayload({
    name: 'WolfPack Media',
    industry: 'AI Marketing',
    website_url: 'wolfpackmediapr.com',
    contact_name: 'Wilfre',
    contact_email: 'wolfpackmediapr@gmail.com',
    contact_phone: '787-000-0000',
    timezone: '',
    preferred_language: 'en/es',
    brand_voice: 'sharp, premium, direct',
  }, 'user-123'), {
    owner_user_id: 'user-123',
    name: 'WolfPack Media',
    slug: 'wolfpack-media',
    industry: 'AI Marketing',
    website_url: 'https://wolfpackmediapr.com',
    contact_name: 'Wilfre',
    contact_email: 'wolfpackmediapr@gmail.com',
    contact_phone: '787-000-0000',
    timezone: 'America/Puerto_Rico',
    status: 'setup',
    notes: 'Preferred language: en/es\nBrand voice: sharp, premium, direct',
  });
});

Deno.test('getBusinessProfileCompletion returns readiness percent and blockers', () => {
  assertEquals(getBusinessProfileCompletion({ name: 'Acme' }), {
    completed: 1,
    total: 6,
    percentComplete: 17,
    blockers: ['Industry is required.', 'Website is required.', 'Contact email is required.', 'Timezone is required.', 'Brand voice is required.'],
    ready: false,
  });

  assertEquals(getBusinessProfileCompletion({
    name: 'Acme',
    industry: 'Restaurant',
    website_url: 'https://acme.com',
    contact_email: 'owner@acme.com',
    timezone: 'America/Puerto_Rico',
    brand_voice: 'friendly and concise',
  }).ready, true);
});
