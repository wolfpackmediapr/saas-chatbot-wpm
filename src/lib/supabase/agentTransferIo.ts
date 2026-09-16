/**
 * Reading an agent out of one account and writing it into another.
 *
 * The pure shape lives in `src/lib/agentTransfer.ts`; this file is the part that
 * touches Supabase, and it deliberately reuses the ordinary write paths
 * (`createBotProfile`, `updateBotProfile`, `upsertBotInstructions`,
 * `createKnowledgeSource`) rather than inserting rows itself. Those paths carry
 * the rules an import must not skip: the owner stamp, the plan's bot limit
 * trigger, the append-only instruction history, and the metadata shape the
 * Knowledge page reads back.
 */

import {
  buildAgentTransfer,
  businessProfileFieldsToApply,
  type AgentTransferFile,
  type TransferBusinessProfile,
} from '../agentTransfer';
import {
  createBotProfile,
  createKnowledgeSource,
  getBotInstructions,
  getOwnedWpmClient,
  listBotProfiles,
  listKnowledgeSources,
  updateBotProfile,
  updateClientProfile,
  upsertBotInstructions,
  type WpmBotProfileRecord,
} from './wpmClients';

export async function exportAgent(clientId: string, agent: WpmBotProfileRecord): Promise<AgentTransferFile> {
  const [instructions, knowledge, client] = await Promise.all([
    getBotInstructions(agent.id),
    listKnowledgeSources(clientId),
    getOwnedWpmClient(),
  ]);

  return buildAgentTransfer({
    agent,
    instructions,
    knowledge,
    agentId: agent.id,
    businessProfile: client
      ? {
        name: client.name,
        description: client.description ?? null,
        services: client.services ?? null,
        location: client.location ?? null,
        industry: client.industry ?? null,
        website_url: client.website_url ?? null,
        contact_email: client.contact_email ?? null,
        contact_phone: client.contact_phone ?? null,
      }
      : null,
    exportedFrom: client?.name ?? null,
  });
}

export interface ImportOutcome {
  botProfileId: string;
  knowledgeImported: number;
  knowledgeFailed: number;
  businessProfileFieldsFilled: string[];
}

/**
 * Create a NEW agent in the signed-in account from a transfer file.
 *
 * Never updates an existing agent: a name collision gets a suffix instead, so an
 * import cannot overwrite a configuration somebody is already using. If the
 * plan's bot limit rejects the insert, the trigger's own message is surfaced.
 */
export async function importAgent(
  clientId: string,
  file: AgentTransferFile,
  options: { applyBusinessProfile: boolean },
): Promise<ImportOutcome> {
  const existing = await listBotProfiles(clientId);
  const taken = new Set(existing.map((a) => a.name.trim().toLowerCase()));
  let name = file.agent.name.trim();
  if (taken.has(name.toLowerCase())) {
    let n = 2;
    while (taken.has(`${name} (${n})`.toLowerCase())) n += 1;
    name = `${name} (${n})`;
  }

  const botProfileId = await createBotProfile(clientId, name);

  await updateBotProfile(botProfileId, {
    public_name: file.agent.public_name ?? name,
    ...(file.agent.tone ? { tone: file.agent.tone } : {}),
    ...(file.agent.response_length ? { response_length: file.agent.response_length } : {}),
    booking_url: file.agent.booking_url,
    handoff_contact: file.agent.handoff_contact,
    settings: file.agent.settings as Record<string, unknown>,
  });

  // A brand-new agent has no instructions row, so the expected version is 0 —
  // handled inside upsertBotInstructions, which reads it before saving.
  await upsertBotInstructions(botProfileId, {
    system_prompt: file.instructions.system_prompt,
    business_summary: file.instructions.business_summary ?? undefined,
    faq_instructions: file.instructions.faq_instructions ?? undefined,
    lead_qualification_instructions: file.instructions.lead_qualification_instructions ?? undefined,
    handoff_rules: file.instructions.handoff_rules ?? undefined,
    never_say_rules: file.instructions.never_say_rules ?? undefined,
    primary_goal: file.instructions.primary_goal ?? undefined,
    response_language: file.instructions.response_language ?? undefined,
    emergency_keywords: file.instructions.emergency_keywords,
    lead_fields: file.instructions.lead_fields,
  });

  // Knowledge is imported one source at a time and scoped to the new agent from
  // the start. A failure here must not roll back the agent: an agent with most
  // of its knowledge is recoverable by hand, an agent that vanished is not.
  let knowledgeImported = 0;
  let knowledgeFailed = 0;
  for (const source of file.knowledge) {
    try {
      await createKnowledgeSource(clientId, {
        title: source.title,
        content_text: source.content_text,
        ui_type: source.ui_type,
        source_url: source.source_url,
        tags: source.tags,
        bot_profile_id: botProfileId,
      });
      knowledgeImported += 1;
    } catch (err) {
      console.error('[agentTransfer] knowledge source failed to import', source.title, err);
      knowledgeFailed += 1;
    }
  }

  let businessProfileFieldsFilled: string[] = [];
  if (options.applyBusinessProfile) {
    const client = await getOwnedWpmClient();
    const toApply = businessProfileFieldsToApply(
      file.business_profile,
      client as Partial<TransferBusinessProfile> | null,
    );
    const keys = Object.keys(toApply);
    if (keys.length) {
      await updateClientProfile(clientId, toApply);
      businessProfileFieldsFilled = keys;
    }
  }

  return { botProfileId, knowledgeImported, knowledgeFailed, businessProfileFieldsFilled };
}
