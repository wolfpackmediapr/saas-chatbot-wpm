/**
 * Which knowledge sources each agent actually reads — mirrored from the edge
 * functions, so the Knowledge Base page never claims more than the agent gets.
 *
 * Per agent, `supabase/functions/_shared/wpm_ai.ts` loads:
 *
 *   status = 'ready' AND (bot_profile_id IS NULL OR bot_profile_id = <agent>)
 *   ORDER BY updated_at DESC LIMIT 8
 *
 * and `buildKnowledgeText()` in `_shared/wpm_prompt.ts` then reads at most
 * 4,000 characters from each source and 12,000 in total, skips a source when
 * fewer than 200 characters of budget remain, and cuts on a line or word
 * boundary so a sentence never ends mid-word.
 *
 * The page used to approximate this as "the first 8 in the list", with the list
 * sorted by CREATION date. The two agreed only while nothing was ever edited,
 * and neither knew about the 12,000 total — so a long source split into four
 * 4,000-character pieces would have shown all four as in use while the agent
 * silently dropped the last one.
 *
 * ⚠️ If either side changes, change both. `scripts/tests/knowledge_usage_test.ts`
 * reads the edge-function source and fails when the numbers drift, and checks
 * this against the real `buildKnowledgeText`.
 *
 * No imports on purpose: this file is shared by Vite and a Deno test.
 */

export const SOURCES_READ_PER_AGENT = 8;
export const MAX_CHARS_PER_SOURCE = 4000;
export const MAX_CHARS_TOTAL = 12000;
export const MIN_USEFUL_CHARS = 200;

export interface KnowledgeUsageInput {
  id: string;
  /** null = shared with every agent on the account. */
  bot_profile_id: string | null;
  updated_at: string;
  content_text: string | null;
  status?: string;
}

export interface KnowledgeUsage {
  /** Agent ids that read at least part of this source (null = no agent resolved). */
  readBy: Array<string | null>;
  /** The most any single agent reads of it. */
  charsRead: number;
  /** Length after trimming, which is what the agent measures. */
  totalChars: number;
}

function timeOf(value: string): number {
  const t = Date.parse(value);
  // An unparseable timestamp sorts as equal, so the server's own order holds.
  return Number.isNaN(t) ? 0 : t;
}

/** Same rule as `truncateAtBoundary()` in `_shared/wpm_prompt.ts`, as a length. */
export function charsKeptAtBoundary(text: string, limit: number): number {
  if (text.length <= limit) return text.length;
  const slice = text.slice(0, limit);
  const boundary = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
  const kept = boundary > limit * 0.5 ? slice.slice(0, boundary) : slice;
  return kept.trimEnd().length;
}

/**
 * @param sources every source on the account
 * @param agentIds the account's ACTIVE agents. A source scoped to an agent not
 *   in this list is read by no one.
 */
export function computeKnowledgeUsage(
  sources: KnowledgeUsageInput[],
  agentIds: string[],
): Map<string, KnowledgeUsage> {
  const usage = new Map<string, KnowledgeUsage>();
  for (const source of sources) {
    usage.set(source.id, {
      readBy: [],
      charsRead: 0,
      totalChars: (source.content_text ?? '').trim().length,
    });
  }

  // With no agent resolved, the edge functions fall back to account-wide only.
  const readers: Array<string | null> = agentIds.length > 0 ? agentIds : [null];

  for (const agent of readers) {
    const loaded = sources
      .filter((s) => (s.status ?? 'ready') === 'ready')
      .filter((s) => s.bot_profile_id === null || s.bot_profile_id === agent)
      .sort((a, b) => timeOf(b.updated_at) - timeOf(a.updated_at))
      // The LIMIT applies in SQL, before empty sources are filtered out.
      .slice(0, SOURCES_READ_PER_AGENT);

    let budget = MAX_CHARS_TOTAL;
    for (const source of loaded) {
      const content = (source.content_text ?? '').trim();
      if (!content) continue;

      const allowance = Math.min(MAX_CHARS_PER_SOURCE, budget);
      if (allowance < MIN_USEFUL_CHARS && content.length > allowance) continue;

      const kept = charsKeptAtBoundary(content, allowance);
      budget -= kept;

      const entry = usage.get(source.id);
      if (entry && kept > 0) {
        entry.readBy.push(agent);
        entry.charsRead = Math.max(entry.charsRead, kept);
      }
    }
  }

  return usage;
}
