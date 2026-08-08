import { supabase } from './client';
import { getOwnedWpmClient } from './wpmClients';
import { EMPTY_EVIDENCE, type LaunchEvidence } from '../wpm/launchChecklist';

/**
 * Gather everything the launch checklist needs, in one pass.
 *
 * Note the instructions lookup goes through bot_profile_id. wpm_bot_instructions
 * has no client_id column — the previous readiness check filtered on one, the
 * request errored, the error was never checked, and the page reported
 * "Instructions: 0" forever even when instructions existed. Every count here
 * logs its error rather than silently folding into 0.
 */
export async function fetchLaunchEvidence(): Promise<LaunchEvidence> {
  if (!supabase) return EMPTY_EVIDENCE;

  const client = await getOwnedWpmClient().catch(() => null);
  if (!client) return EMPTY_EVIDENCE;

  const clientId = client.id;
  const db = supabase;

  async function countWhere(
    table: string,
    apply: (query: ReturnType<typeof db.from>) => unknown,
  ): Promise<number> {
    const query = db.from(table).select('id', { count: 'exact', head: true });
    const { count, error } = (await apply(query as never)) as {
      count: number | null;
      error: { message: string } | null;
    };
    if (error) {
      console.error(`[launchStatus] ${table} count failed:`, error.message);
      return 0;
    }
    return count ?? 0;
  }

  // Channels come back as rows so webhook_subscribed can be read off metadata.
  const channelsResult = await db
    .from('wpm_client_channels')
    .select('id, metadata')
    .eq('client_id', clientId)
    .eq('is_active', true);

  if (channelsResult.error) {
    console.error('[launchStatus] channels query failed:', channelsResult.error.message);
  }
  const channels = (channelsResult.data ?? []) as Array<{
    id: string;
    metadata: Record<string, unknown> | null;
  }>;

  const botProfilesResult = await db
    .from('wpm_bot_profiles')
    .select('id')
    .eq('client_id', clientId)
    .eq('is_active', true);

  if (botProfilesResult.error) {
    console.error('[launchStatus] bot profiles query failed:', botProfilesResult.error.message);
  }
  const botProfileIds = ((botProfilesResult.data ?? []) as Array<{ id: string }>).map((r) => r.id);

  const [readyKnowledge, liveConversations, aiReplies, activeIntegrations, activeInstructions] =
    await Promise.all([
      countWhere('wpm_knowledge_sources', (q) =>
        (q as never as ReturnType<typeof db.from>)
          .eq('client_id', clientId)
          .eq('status', 'ready'),
      ),
      // Deliberately NOT wpm_webhook_events: its client_id is never populated
      // by the webhook pipeline, so any count scoped to a client is always 0.
      countWhere('wpm_conversations', (q) =>
        (q as never as ReturnType<typeof db.from>)
          .eq('client_id', clientId)
          .in('channel_type', ['instagram', 'facebook']),
      ),
      countWhere('wpm_messages', (q) =>
        (q as never as ReturnType<typeof db.from>)
          .eq('client_id', clientId)
          .eq('metadata->>generated_by', 'wpm_ai'),
      ),
      countWhere('wpm_integrations', (q) =>
        (q as never as ReturnType<typeof db.from>)
          .eq('client_id', clientId)
          .eq('is_active', true),
      ),
      botProfileIds.length
        ? countWhere('wpm_bot_instructions', (q) =>
            (q as never as ReturnType<typeof db.from>)
              .in('bot_profile_id', botProfileIds)
              .eq('is_active', true),
          )
        : Promise.resolve(0),
    ]);

  return {
    clientName: client.name ?? null,
    activeChannels: channels.length,
    webhookSubscribedChannels: channels.filter(
      (channel) => String(channel.metadata?.webhook_subscribed) === 'true',
    ).length,
    activeBotProfiles: botProfileIds.length,
    activeInstructions,
    readyKnowledge,
    liveConversations,
    aiReplies,
    activeIntegrations,
  };
}
