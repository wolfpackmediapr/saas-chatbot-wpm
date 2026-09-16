/**
 * The agent transfer file is the only portable copy of an agent's configuration
 * that exists — knowledge edits keep no history, so a bad export is data loss
 * with no second chance. These pin the shape, the round trip, and the three
 * rules that protect the destination account.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  AGENT_TRANSFER_FORMAT,
  buildAgentTransfer,
  canTransferAgents,
  businessProfileFieldsToApply,
  describeTransfer,
  parseAgentTransfer,
  transferFileName,
} from '../../src/lib/agentTransfer.ts';

const agentId = 'agent-sky';

function sourceInputs() {
  return {
    agent: {
      name: 'Skywake Aviation',
      public_name: 'Skywake Aviation',
      tone: 'professional and friendly',
      response_length: 'balanced',
      booking_url: 'https://www.facebook.com/skywakeaviationpr',
      handoff_contact: 'skywakeaviationpr@gmail.com',
      settings: { foo: 'bar' },
    },
    instructions: {
      system_prompt: 'You are the first-response assistant for Skywake Aviation.',
      handoff_rules: 'Escalate on pricing.',
      never_say_rules: 'Never guarantee pricing.',
      primary_goal: 'Collect contact info / lead capture',
      response_language: 'English + Latin American Spanish',
      emergency_keywords: ['humano', 'emergency', ''],
      lead_fields: ['name', 'email'],
      business_summary: null,
      faq_instructions: null,
      lead_qualification_instructions: null,
    },
    knowledge: [
      { bot_profile_id: agentId, title: 'Programs', content_text: 'PPL, IR, CPL', metadata: { ui_type: 'service', tags: ['flight'] }, source_url: null },
      { bot_profile_id: agentId, title: 'Contact', content_text: '(787) 336-0300', metadata: { ui_type: 'faq' }, source_url: null },
      { bot_profile_id: 'agent-wpm', title: "Another agent's doc", content_text: 'secret', metadata: {}, source_url: null },
      { bot_profile_id: null, title: 'Account-wide policy', content_text: 'shared', metadata: {}, source_url: null },
    ],
    agentId,
    businessProfile: {
      name: 'WolfPack Media',
      description: 'AI-native agency',
      services: 'Web, DM agents',
      location: 'San Juan',
      industry: 'Tech / SaaS',
      website_url: 'https://www.wolfpackmediapr.com',
      contact_email: 'marketing@wolfpackmediapr.com',
      contact_phone: '+1 (754) 206-6255',
    },
    exportedFrom: 'WolfPack Media',
    now: new Date('2026-09-16T16:00:00Z'),
  };
}

Deno.test('an export takes this agent’s knowledge and nobody else’s', () => {
  const file = buildAgentTransfer(sourceInputs());
  assertEquals(file.knowledge.map((k) => k.title), ['Programs', 'Contact']);
  assertEquals(file.skipped_account_wide_sources, 1, 'account-wide sources are counted, not taken');
  assert(!JSON.stringify(file).includes('secret'), "another agent's knowledge must never leave the account");
});

Deno.test('the file carries no ids, tokens or tenant identifiers', () => {
  const text = JSON.stringify(buildAgentTransfer(sourceInputs()));
  for (const forbidden of ['agent-sky', 'agent-wpm', 'client_id', 'owner_user_id', 'access_token', 'page_access_token']) {
    assert(!text.includes(forbidden), `${forbidden} must not travel in the file`);
  }
});

Deno.test('export → parse → import round-trips every field', () => {
  const exported = buildAgentTransfer(sourceInputs());
  const parsed = parseAgentTransfer(JSON.stringify(exported));
  assert(parsed.ok, 'a file we just wrote must parse');
  if (!parsed.ok) return;

  assertEquals(parsed.file.agent, exported.agent);
  assertEquals(parsed.file.instructions, exported.instructions);
  assertEquals(parsed.file.knowledge, exported.knowledge);
  assertEquals(parsed.file.business_profile, exported.business_profile);
  assertEquals(parsed.file.skipped_account_wide_sources, 1);
  // Empty strings are dropped on the way out, so they cannot arrive as keywords.
  assertEquals(parsed.file.instructions.emergency_keywords, ['humano', 'emergency']);
});

Deno.test('a damaged or foreign file is refused, with a sentence a person can act on', () => {
  const cases: Array<[string, string]> = [
    ['not json at all', 'valid JSON'],
    [JSON.stringify({ format: 99, agent: { name: 'x' }, instructions: { system_prompt: '' } }), 'different version'],
    [JSON.stringify({ format: AGENT_TRANSFER_FORMAT, agent: {}, instructions: { system_prompt: '' } }), 'no agent name'],
    [JSON.stringify({ format: AGENT_TRANSFER_FORMAT, agent: { name: 'x' } }), 'no instructions'],
    [JSON.stringify({ format: AGENT_TRANSFER_FORMAT, agent: { name: 'x' }, instructions: { system_prompt: 'p' }, knowledge: 'nope' }), 'damaged'],
  ];
  for (const [text, expected] of cases) {
    const result = parseAgentTransfer(text);
    assertEquals(result.ok, false, `should refuse: ${text.slice(0, 40)}`);
    if (!result.ok) assert(result.error.includes(expected), `“${result.error}” should mention ${expected}`);
  }
});

Deno.test('an oversized file is refused before it is parsed', () => {
  const result = parseAgentTransfer('x'.repeat(2_000_001));
  assertEquals(result.ok, false);
});

Deno.test('importing never overwrites a Business Profile the destination already filled', () => {
  const incoming = sourceInputs().businessProfile;
  const configured = {
    name: 'Skywake Aviation',
    description: 'Flight training',
    services: null,
    location: null,
    industry: null,
    website_url: null,
    contact_email: null,
    contact_phone: null,
  };
  const toApply = businessProfileFieldsToApply(incoming, configured);
  assert(!('name' in toApply), 'a name the destination already set must survive');
  assert(!('description' in toApply));
  assertEquals(toApply.services, 'Web, DM agents');
  assertEquals(Object.keys(businessProfileFieldsToApply(incoming, incoming)).length, 0);
  assertEquals(Object.keys(businessProfileFieldsToApply(null, configured)).length, 0);
});

Deno.test('the summary and filename are legible a year later', () => {
  const file = buildAgentTransfer(sourceInputs());
  const summary = describeTransfer(file);
  assert(summary.includes('Skywake Aviation'));
  assert(summary.includes('2 knowledge sources'));
  assertEquals(transferFileName('Skywake Aviation', new Date('2026-09-16T16:00:00Z')), 'wolfpack-agent-skywake-aviation-2026-09-16.json');
  assertEquals(transferFileName('', new Date('2026-09-16T16:00:00Z')), 'wolfpack-agent-agent-2026-09-16.json');
});

Deno.test('moving agents is an Agency feature', () => {
  assertEquals(canTransferAgents('agency', 'active'), true);
  assertEquals(canTransferAgents('Agency', 'trialing'), true, 'case and trialing both count');
  assertEquals(canTransferAgents('agency', 'canceled'), false);
  for (const plan of ['free', 'starter', 'growth', 'pro']) {
    assertEquals(canTransferAgents(plan, 'active'), false, `${plan} must not see the buttons`);
  }
  assertEquals(canTransferAgents(null, null), false, 'a brand-new signup has no row');
  assertEquals(canTransferAgents(undefined, undefined), false);
});
