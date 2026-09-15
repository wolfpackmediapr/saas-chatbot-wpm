/**
 * The Knowledge Base page's "Not in use" / "Agent reads X of Y" badges come from
 * `src/lib/knowledgeUsage.ts`, which MIRRORS what the edge functions load and
 * read. A mirror is only worth having while it matches, so this file checks it
 * two ways: the numbers against the edge-function source, and the character
 * counts against the real `buildKnowledgeText`.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  charsKeptAtBoundary,
  computeKnowledgeUsage,
  type KnowledgeUsageInput,
  MAX_CHARS_PER_SOURCE,
  MAX_CHARS_TOTAL,
  MIN_USEFUL_CHARS,
  SOURCES_READ_PER_AGENT,
} from '../../src/lib/knowledgeUsage.ts';
import { buildKnowledgeText } from '../../supabase/functions/_shared/wpm_prompt.ts';

const promptSource = await Deno.readTextFile(new URL('../../supabase/functions/_shared/wpm_prompt.ts', import.meta.url));
const aiSource = await Deno.readTextFile(new URL('../../supabase/functions/_shared/wpm_ai.ts', import.meta.url));

function words(n: number, word = 'lorem'): string {
  // Space-separated so boundary cuts behave like real prose.
  let out = '';
  while (out.length < n) out += (out ? ' ' : '') + word;
  return out.slice(0, n);
}

let clock = Date.parse('2026-09-15T00:00:00Z');
function src(id: string, content: string, bot: string | null = null, minutesAgo?: number): KnowledgeUsageInput {
  clock -= 60_000;
  const at = minutesAgo === undefined ? clock : Date.parse('2026-09-15T00:00:00Z') - minutesAgo * 60_000;
  return { id, bot_profile_id: bot, updated_at: new Date(at).toISOString(), content_text: content, status: 'ready' };
}

// ── The mirror matches the edge functions ───────────────────────────────────

Deno.test('the limits match the edge-function source', () => {
  const num = (name: string) => Number(promptSource.match(new RegExp(`const ${name} = (\\d+);`))?.[1]);
  assertEquals(MAX_CHARS_PER_SOURCE, num('MAX_KNOWLEDGE_CHARS_PER_SOURCE'));
  assertEquals(MAX_CHARS_TOTAL, num('MAX_KNOWLEDGE_CHARS_TOTAL'));
  assertEquals(MIN_USEFUL_CHARS, num('MIN_USEFUL_KNOWLEDGE_CHARS'));

  const knowledgeQuery = aiSource.slice(aiSource.indexOf(".from('wpm_knowledge_sources')"));
  const limit = Number(knowledgeQuery.match(/\.limit\((\d+)\)/)?.[1]);
  assertEquals(SOURCES_READ_PER_AGENT, limit, 'wpm_ai.ts knowledge LIMIT changed');
  assert(knowledgeQuery.indexOf("order('updated_at', { ascending: false })") > -1, 'the agent no longer reads newest-updated first');
});

Deno.test('character counts agree with the real buildKnowledgeText', () => {
  const fixtures = [
    src('a', words(4000)),
    src('b', words(14687, 'skywake')),
    src('c', words(3900)),
    src('d', words(500)),
    src('e', words(60)),
  ];
  const usage = computeKnowledgeUsage(fixtures, []);
  const text = buildKnowledgeText(fixtures.map((f) => ({ title: f.id, content_text: f.content_text })));

  for (const f of fixtures) {
    const u = usage.get(f.id)!;
    const content = f.content_text!.trim();
    if (u.charsRead === 0) {
      assert(!text.includes(`### ${f.id}\n`), `${f.id} is read by the prompt but the page says no one reads it`);
      continue;
    }
    const kept = content.slice(0, u.charsRead);
    const trimmed = u.charsRead < content.length;
    const expected = `### ${f.id}\n${kept}` + (trimmed ? '\n[This source was shortened' : '');
    assert(text.includes(expected), `${f.id}: page says ${u.charsRead} chars read, the prompt disagrees`);
  }
});

// ── What the page will now say ──────────────────────────────────────────────

Deno.test('a 14,687-character source is read only to 4,000, on a word boundary', () => {
  const usage = computeKnowledgeUsage([src('skywake', words(14687, 'skywake'))], ['agent-sky']);
  const u = usage.get('skywake')!;
  assert(u.charsRead <= MAX_CHARS_PER_SOURCE && u.charsRead > MAX_CHARS_PER_SOURCE * 0.9);
  assertEquals(u.totalChars, 14687);
  assertEquals(u.readBy, ['agent-sky']);
});

Deno.test('splitting into four 4,000-character pieces: the fourth is not read', () => {
  const pieces = ['p1', 'p2', 'p3', 'p4'].map((id) => src(id, words(4000)));
  const usage = computeKnowledgeUsage(pieces, ['agent-sky']);
  assertEquals(['p1', 'p2', 'p3', 'p4'].map((id) => usage.get(id)!.charsRead > 0), [true, true, true, false]);
});

Deno.test('when less than 200 characters of budget remain, a long source is skipped but a short one still fits', () => {
  const sources = [src('big1', words(4000)), src('big2', words(4000)), src('big3', words(3900)), src('long', words(500)), src('tiny', words(60))];
  const usage = computeKnowledgeUsage(sources, []);
  assertEquals(usage.get('long')!.charsRead, 0);
  // Compared to the TRIMMED length: the agent trims content before measuring it.
  const tiny = usage.get('tiny')!;
  assert(tiny.charsRead > 0);
  assertEquals(tiny.charsRead, tiny.totalChars);
});

Deno.test('only the 8 most recently updated sources are loaded', () => {
  const sources = Array.from({ length: 9 }, (_, i) => src(`s${i}`, words(100)));
  const usage = computeKnowledgeUsage(sources, []);
  assertEquals(usage.get('s8')!.readBy.length, 0, 'the oldest of nine is not read');
  assertEquals(usage.get('s0')!.readBy.length, 1);
});

Deno.test('editing an old source moves it into the agent\'s 8 and pushes another out', () => {
  const sources = Array.from({ length: 9 }, (_, i) => src(`s${i}`, words(100)));
  sources[8] = { ...sources[8], updated_at: '2026-09-16T00:00:00.000Z' }; // just edited
  const usage = computeKnowledgeUsage(sources, []);
  assertEquals(usage.get('s8')!.readBy.length, 1);
  assertEquals(usage.get('s7')!.readBy.length, 0);
});

Deno.test('scope: an agent never reads another agent\'s source; account-wide is read by all', () => {
  const sources = [
    src('wolfpack-only', words(300), 'agent-wpm'),
    src('skywake-only', words(300), 'agent-sky'),
    src('shared', words(300), null),
    src('orphan', words(300), 'agent-deleted'),
  ];
  const usage = computeKnowledgeUsage(sources, ['agent-wpm', 'agent-sky']);
  assertEquals(usage.get('wolfpack-only')!.readBy, ['agent-wpm']);
  assertEquals(usage.get('skywake-only')!.readBy, ['agent-sky']);
  assertEquals(usage.get('shared')!.readBy, ['agent-wpm', 'agent-sky']);
  assertEquals(usage.get('orphan')!.readBy, [], 'a source scoped to an inactive agent is read by no one');
});

Deno.test('one agent\'s full budget does not hide a source another agent reads', () => {
  const sources = [
    src('wpm1', words(4000), 'agent-wpm'),
    src('wpm2', words(4000), 'agent-wpm'),
    src('wpm3', words(4000), 'agent-wpm'),
    src('shared', words(300), null),
  ];
  const usage = computeKnowledgeUsage(sources, ['agent-wpm', 'agent-sky']);
  assertEquals(usage.get('shared')!.readBy, ['agent-sky']);
});

Deno.test('empty sources and non-ready sources are never counted as read', () => {
  const usage = computeKnowledgeUsage([
    src('blank', '   '),
    { ...src('draft', words(100)), status: 'draft' },
  ], []);
  assertEquals(usage.get('blank')!.readBy.length, 0);
  assertEquals(usage.get('draft')!.readBy.length, 0);
});

Deno.test('the boundary rule cuts at a space, never mid-word', () => {
  const text = words(4100, 'aviation');
  const kept = charsKeptAtBoundary(text, 4000);
  assert(kept < 4000);
  assertEquals(text[kept], ' ');
});
