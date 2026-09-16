/**
 * Move an agent between accounts as a file.
 *
 * Added 2026-09-16. Skywake Aviation was onboarded inside WolfPack's account,
 * which put WolfPack's Business Profile into Skywake's prompt and sent Skywake's
 * first real lead to WolfPack's Zapier. The fix is a separate login — and
 * without this, "separate login" means retyping a 3,313-character system prompt,
 * five knowledge sources, escalation keywords and lead fields by hand, with no
 * way to check afterwards that nothing was dropped.
 *
 * ── Why a file, and not a server-side copy ──────────────────────────────────
 *
 * The two accounts are different owners. Every read path here is RLS-scoped to
 * the signed-in owner, so a cross-account copy would need service_role and a
 * way to prove the destination owner consented. A file sidesteps both: the
 * person who owns the data exports it, and the person who owns the destination
 * imports it. Nothing new is granted, and the same file doubles as a backup —
 * which is the only copy of an agent's configuration that exists anywhere, since
 * knowledge edits keep no history.
 *
 * ── What is deliberately NOT in the file ────────────────────────────────────
 *
 * - **Channels and page tokens.** A Meta connection belongs to the Facebook
 *   login that authorised it and cannot be transferred; the destination account
 *   must run Connect via Meta itself.
 * - **Conversations, messages and leads.** History stays with the account that
 *   answered it. `wpm_conversations.bot_profile_id` records who replied.
 * - **Integrations (Zapier hooks, lead email).** Those are account-level and are
 *   exactly what the move is meant to separate.
 * - **Account-wide knowledge** (`bot_profile_id = null`). It belongs to the whole
 *   source account, not to this agent, so it is counted and reported rather than
 *   silently taken. `skippedAccountWideSources` is that count.
 * - **Any id.** No client id, agent id or owner id travels in the file, so it
 *   carries no tenant identifier and cannot be replayed against the wrong row.
 *
 * No imports on purpose: shared by Vite and a Deno test.
 */

export const AGENT_TRANSFER_FORMAT = 1;

/** A byte ceiling so a pathological file cannot be parsed into memory. */
export const MAX_TRANSFER_BYTES = 2_000_000;

export interface TransferAgent {
  name: string;
  public_name: string | null;
  tone: string | null;
  response_length: string | null;
  booking_url: string | null;
  handoff_contact: string | null;
  settings: Record<string, unknown>;
}

export interface TransferInstructions {
  system_prompt: string;
  business_summary: string | null;
  faq_instructions: string | null;
  lead_qualification_instructions: string | null;
  handoff_rules: string | null;
  never_say_rules: string | null;
  primary_goal: string | null;
  response_language: string | null;
  emergency_keywords: string[];
  lead_fields: string[];
}

export interface TransferKnowledge {
  title: string;
  content_text: string;
  ui_type: string;
  source_url: string | null;
  tags: string;
}

/**
 * The source account's Business Profile. Included because it is what the agent's
 * prompt actually injects (`wpm_prompt.ts:411-418`) — an agent moved without it
 * would introduce itself as the wrong business, which is the very bug the move
 * exists to fix. Applied on import only to fields the destination leaves empty.
 */
export interface TransferBusinessProfile {
  name: string | null;
  description: string | null;
  services: string | null;
  location: string | null;
  industry: string | null;
  website_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

export interface AgentTransferFile {
  format: number;
  exported_at: string;
  /** Provenance only — never used to write anything. */
  exported_from: string | null;
  agent: TransferAgent;
  instructions: TransferInstructions;
  knowledge: TransferKnowledge[];
  business_profile: TransferBusinessProfile | null;
  skipped_account_wide_sources: number;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}

export function buildAgentTransfer(input: {
  agent: {
    name: string;
    public_name?: string | null;
    tone?: string | null;
    response_length?: string | null;
    booking_url?: string | null;
    handoff_contact?: string | null;
    settings?: Record<string, unknown> | null;
  };
  instructions: Partial<TransferInstructions> | null;
  /** Every knowledge source on the account; agent-scoped ones are selected here. */
  knowledge: Array<{
    bot_profile_id?: string | null;
    title?: string | null;
    content_text?: string | null;
    metadata?: Record<string, unknown> | null;
    source_url?: string | null;
  }>;
  agentId: string;
  businessProfile?: Partial<TransferBusinessProfile> | null;
  exportedFrom?: string | null;
  now?: Date;
}): AgentTransferFile {
  const mine = input.knowledge.filter((k) => k.bot_profile_id === input.agentId);
  const accountWide = input.knowledge.filter((k) => !k.bot_profile_id).length;

  return {
    format: AGENT_TRANSFER_FORMAT,
    exported_at: (input.now ?? new Date()).toISOString(),
    exported_from: input.exportedFrom ?? null,
    agent: {
      name: input.agent.name,
      public_name: str(input.agent.public_name),
      tone: str(input.agent.tone),
      response_length: str(input.agent.response_length),
      booking_url: str(input.agent.booking_url),
      handoff_contact: str(input.agent.handoff_contact),
      settings: (input.agent.settings ?? {}) as Record<string, unknown>,
    },
    instructions: {
      system_prompt: typeof input.instructions?.system_prompt === 'string' ? input.instructions.system_prompt : '',
      business_summary: str(input.instructions?.business_summary),
      faq_instructions: str(input.instructions?.faq_instructions),
      lead_qualification_instructions: str(input.instructions?.lead_qualification_instructions),
      handoff_rules: str(input.instructions?.handoff_rules),
      never_say_rules: str(input.instructions?.never_say_rules),
      primary_goal: str(input.instructions?.primary_goal),
      response_language: str(input.instructions?.response_language),
      emergency_keywords: strArray(input.instructions?.emergency_keywords),
      lead_fields: strArray(input.instructions?.lead_fields),
    },
    knowledge: mine.map((k) => ({
      title: k.title ?? 'Untitled',
      content_text: k.content_text ?? '',
      ui_type: typeof k.metadata?.ui_type === 'string' ? (k.metadata.ui_type as string) : 'other',
      source_url: str(k.source_url),
      tags: Array.isArray(k.metadata?.tags) ? (k.metadata!.tags as string[]).join(', ') : '',
    })),
    business_profile: input.businessProfile
      ? {
        name: str(input.businessProfile.name),
        description: str(input.businessProfile.description),
        services: str(input.businessProfile.services),
        location: str(input.businessProfile.location),
        industry: str(input.businessProfile.industry),
        website_url: str(input.businessProfile.website_url),
        contact_email: str(input.businessProfile.contact_email),
        contact_phone: str(input.businessProfile.contact_phone),
      }
      : null,
    skipped_account_wide_sources: accountWide,
  };
}

/** A filename someone can recognise a year later. */
export function transferFileName(agentName: string, now: Date = new Date()): string {
  const slug = agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agent';
  return `wolfpack-agent-${slug}-${now.toISOString().slice(0, 10)}.json`;
}

export type ParseResult =
  | { ok: true; file: AgentTransferFile }
  | { ok: false; error: string };

/**
 * Parse and validate an uploaded file.
 *
 * Rejects rather than repairs: an import writes a live agent, and a half-read
 * file would produce one that answers customers with pieces missing. The error
 * strings are shown to the person, so they say what to do.
 */
export function parseAgentTransfer(text: string): ParseResult {
  if (text.length > MAX_TRANSFER_BYTES) {
    return { ok: false, error: 'That file is too large to be an agent export.' };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON. Export it again from the other account.' };
  }

  const obj = raw as Partial<AgentTransferFile>;
  if (!obj || typeof obj !== 'object') {
    return { ok: false, error: 'That file does not contain an agent.' };
  }
  if (obj.format !== AGENT_TRANSFER_FORMAT) {
    return {
      ok: false,
      error: `This file was written by a different version of the app (format ${String(obj.format)}). Export it again.`,
    };
  }
  if (!obj.agent || typeof obj.agent.name !== 'string' || !obj.agent.name.trim()) {
    return { ok: false, error: 'That export has no agent name, so there is nothing to create.' };
  }
  if (!obj.instructions || typeof obj.instructions.system_prompt !== 'string') {
    return { ok: false, error: 'That export has no instructions. Importing it would create an empty agent.' };
  }
  if (obj.knowledge !== undefined && !Array.isArray(obj.knowledge)) {
    return { ok: false, error: 'That export’s knowledge section is damaged.' };
  }

  // Rebuild through the same normaliser the exporter uses, so an import can
  // never write a shape the app does not otherwise produce.
  const file = buildAgentTransfer({
    agent: obj.agent,
    instructions: obj.instructions,
    knowledge: (obj.knowledge ?? []).map((k) => ({
      bot_profile_id: 'self',
      title: k.title,
      content_text: k.content_text,
      source_url: k.source_url,
      metadata: { ui_type: k.ui_type, tags: k.tags ? String(k.tags).split(',').map((t) => t.trim()).filter(Boolean) : [] },
    })),
    agentId: 'self',
    businessProfile: obj.business_profile ?? null,
    exportedFrom: obj.exported_from ?? null,
    now: obj.exported_at ? new Date(obj.exported_at) : undefined,
  });
  file.skipped_account_wide_sources = typeof obj.skipped_account_wide_sources === 'number'
    ? obj.skipped_account_wide_sources
    : 0;

  return { ok: true, file };
}

/**
 * Which Business Profile fields an import may write.
 *
 * Only ones the destination has left empty. A person importing an agent into an
 * account they have already set up must not have their own business description
 * replaced by the source account's.
 */
export function businessProfileFieldsToApply(
  incoming: TransferBusinessProfile | null,
  current: Partial<TransferBusinessProfile> | null,
  // Values are always non-empty strings — the nulls are filtered out below — so
  // the result drops straight into updateClientProfile without a cast.
): Partial<Record<keyof TransferBusinessProfile, string>> {
  if (!incoming) return {};
  const out: Partial<Record<keyof TransferBusinessProfile, string>> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value !== 'string' || !value.trim()) continue;
    const existing = (current ?? {})[key as keyof TransferBusinessProfile];
    if (typeof existing === 'string' && existing.trim()) continue;
    out[key as keyof TransferBusinessProfile] = value;
  }
  return out;
}

/** One-line summary for the confirmation step, so nobody imports blind. */
export function describeTransfer(file: AgentTransferFile): string {
  const chars = file.knowledge.reduce((sum, k) => sum + k.content_text.trim().length, 0);
  const parts = [
    `agent “${file.agent.name}”`,
    `${file.instructions.system_prompt.length.toLocaleString()} characters of instructions`,
    `${file.knowledge.length} knowledge source${file.knowledge.length === 1 ? '' : 's'} (${chars.toLocaleString()} characters)`,
  ];
  if (file.instructions.emergency_keywords.length) {
    parts.push(`${file.instructions.emergency_keywords.length} escalation keywords`);
  }
  return parts.join(' · ');
}

/**
 * Who may move agents between accounts.
 *
 * An Agency feature by decision (Wilf, 2026-09-16): moving an agent only means
 * anything when one person runs several businesses, which is the Agency plan's
 * whole premise. Comped agency accounts (WolfPack's own, `will@`) are agency
 * rows too, so they are covered without a separate admin check.
 *
 * A missing subscription row means a brand-new signup — not entitled.
 */
export const TRANSFER_PLANS = ['agency'];

export function canTransferAgents(plan?: string | null, status?: string | null): boolean {
  if (!plan) return false;
  // A cancelled or past-due agency keeps the feature until the row actually
  // changes plan; only an explicitly dead status turns it off.
  const live = !status || status === 'active' || status === 'trialing';
  return live && TRANSFER_PLANS.includes(plan.trim().toLowerCase());
}
