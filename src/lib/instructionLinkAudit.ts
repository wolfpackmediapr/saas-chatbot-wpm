/**
 * Finds links and booking-tool names typed into an agent's free-text
 * instructions that disagree with the booking link configured next to them.
 *
 * Why this exists: `booking_url` lives on `wpm_bot_profiles` while the prose
 * lives on `wpm_bot_instructions`, and nothing keeps the two agreeing. Hard
 * rule 11 makes `booking_url` outrank the CONVERSATION HISTORY, but it cannot
 * outrank instruction text that names a different destination outright — the
 * prompt is what the model reads as fact.
 *
 * Found live on 2026-08-30: an agent whose instructions said "book a Calendly
 * discovery call" kept sending a dead Calendly URL it read out of the
 * conversation history, 15 hours after the URL itself had been removed from
 * every config field. The brand name alone was enough. Nothing warned anyone,
 * and every message still recorded as delivered.
 *
 * This is a warning, never a block: plenty of businesses legitimately mention
 * another site, and refusing the save would be worse than the confusion.
 */

/** A destination found in prose that the configured booking link does not match. */
export interface LinkConflict {
  /** Human label of the field, as it reads on the page. */
  field: string;
  /** The exact text found, shown back so it can be searched for. */
  found: string;
  kind: 'link' | 'booking-tool';
}

/**
 * Booking tools worth naming. A brand name with no URL is the case that caused
 * the live incident, so matching the word matters as much as matching a link.
 */
const BOOKING_TOOLS = [
  'calendly',
  'cal.com',
  'acuity',
  'savvycal',
  'tidycal',
  'koalendar',
  'calendso',
  'setmore',
  'chili piper',
  'youcanbook',
] as const;

/**
 * Bare domains are matched only against common TLDs. An unrestricted pattern
 * flags "Node.js" and "etc.Our", and a warning nobody trusts gets ignored —
 * which is how the typecheck failure in this repo's history went unread.
 */
const COMMON_TLDS =
  'com|net|org|io|co|ai|app|me|us|pr|es|dev|xyz|link|page|site|shop|store|biz|info|tv|so|ly|cc|uk|mx|do';

const EXPLICIT_URL = /https?:\/\/[^\s<>"')]+/gi;
const BARE_DOMAIN = new RegExp(
  `\\b(?:[a-z0-9][a-z0-9-]*\\.)+(?:${COMMON_TLDS})\\b(?:\\/[^\\s<>"')]*)?`,
  'gi',
);

/**
 * Reduces a link to something comparable: no protocol, no `www.`, no trailing
 * slash, lowercased. `https://Example.com/` and `example.com` are the same
 * destination and must not be reported as a conflict.
 */
export function normalizeLink(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[.,;:!?)]+$/, '')
    .replace(/\/+$/, '');
}

function findLinks(text: string): string[] {
  const found = [...(text.match(EXPLICIT_URL) ?? []), ...(text.match(BARE_DOMAIN) ?? [])];
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of found) {
    const key = normalizeLink(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(raw.replace(/[.,;:!?)]+$/, ''));
  }
  return unique;
}

/**
 * @param fields  Label → prose, in the order they appear on the page.
 * @param bookingUrl  The link configured for this agent, if any.
 */
export function findLinkConflicts(
  fields: Array<{ field: string; text: string | null | undefined }>,
  bookingUrl: string | null | undefined,
): LinkConflict[] {
  const booking = normalizeLink(bookingUrl ?? '');
  const conflicts: LinkConflict[] = [];

  for (const { field, text } of fields) {
    if (!text?.trim()) continue;
    const haystack = text.toLowerCase();

    for (const link of findLinks(text)) {
      const normalized = normalizeLink(link);
      // A link that IS the booking link is the correct thing to write.
      if (booking && (normalized === booking || normalized.startsWith(`${booking}/`))) continue;
      conflicts.push({ field, found: link, kind: 'link' });
    }

    for (const tool of BOOKING_TOOLS) {
      if (!haystack.includes(tool)) continue;
      // Naming the tool your link actually points at is not a conflict.
      if (booking.includes(tool.replace(/\s|\.com$/g, ''))) continue;
      conflicts.push({ field, found: tool, kind: 'booking-tool' });
    }
  }

  return conflicts;
}
