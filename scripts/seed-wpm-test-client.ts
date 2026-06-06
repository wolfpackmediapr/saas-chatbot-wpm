#!/usr/bin/env -S deno run --allow-env --allow-net
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import {
  buildSeedBotProfilePayload,
  buildSeedChannelPayload,
  buildSeedClientPayload,
  buildSeedInstructionsPayload,
  buildSeedIntegrationPayload,
  buildSeedKnowledgePayloads,
  buildWpmSeedConfig,
  type WpmSeedConfig,
} from '../supabase/functions/_shared/wpm_seed.ts';

type SupabaseClientLike = any;

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) continue;

    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }
  return args;
}

function stringArg(args: Args, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function boolArg(args: Args, key: string): boolean | undefined {
  const value = args[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  return undefined;
}

function toRecord<T extends object>(payload: T): Record<string, unknown> {
  return payload as unknown as Record<string, unknown>;
}

function buildConfigFromArgs(args: Args): WpmSeedConfig {
  return buildWpmSeedConfig({
    clientSlug: stringArg(args, 'client-slug') ?? undefined,
    clientName: stringArg(args, 'client-name') ?? undefined,
    channelType: stringArg(args, 'channel-type') as WpmSeedConfig['channelType'] | undefined,
    providerChannelId: stringArg(args, 'provider-channel-id') ?? stringArg(args, 'woztell-channel-id') ?? undefined,
    providerBotId: stringArg(args, 'provider-bot-id') ?? stringArg(args, 'woztell-bot-id') ?? undefined,
    externalPageId: stringArg(args, 'external-page-id') ?? undefined,
    externalPhoneNumber: stringArg(args, 'external-phone-number') ?? undefined,
    bookingUrl: stringArg(args, 'booking-url') ?? undefined,
    activateZapierPlaceholder: boolArg(args, 'activate-zapier') ?? undefined,
  });
}

function errorMessage(error: unknown): string {
  if (!error) return 'unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code, String(error)].filter((value) => value && value !== '[object Object]');
    if (parts.length > 0) return parts.join(' | ');
    return JSON.stringify(record);
  }
  return String(error);
}

async function single<T>(query: PromiseLike<{ data: T | null; error: unknown }>, label: string): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${errorMessage(error)}`);
  if (!data) throw new Error(`${label}: no data returned`);
  return data;
}

async function maybeSingle<T>(query: PromiseLike<{ data: T | null; error: unknown }>, label: string): Promise<T | null> {
  const { data, error } = await query;
  if (error) {
    const code = typeof error === 'object' && error !== null ? (error as { code?: string }).code : undefined;
    if (code !== 'PGRST116') throw new Error(`${label}: ${errorMessage(error)}`);
  }
  return data ?? null;
}

async function upsertClient(supabase: SupabaseClientLike, config: WpmSeedConfig): Promise<{ id: string }> {
  return single(
    supabase
      .from('wpm_clients')
      .upsert(toRecord(buildSeedClientPayload(config)), { onConflict: 'slug' })
      .select('id')
      .single(),
    'upsert wpm_clients',
  );
}

async function upsertChannel(supabase: SupabaseClientLike, clientId: string, config: WpmSeedConfig): Promise<{ id: string }> {
  return single(
    supabase
      .from('wpm_client_channels')
      .upsert(toRecord(buildSeedChannelPayload(clientId, config)), { onConflict: 'provider,provider_channel_id,channel_type' })
      .select('id')
      .single(),
    'upsert wpm_client_channels',
  );
}

async function upsertBotProfile(supabase: SupabaseClientLike, clientId: string, config: WpmSeedConfig): Promise<{ id: string }> {
  const existing = await maybeSingle<{ id: string }>(
    supabase
      .from('wpm_bot_profiles')
      .select('id')
      .eq('client_id', clientId)
      .eq('template_key', config.botTemplateKey)
      .maybeSingle(),
    'select wpm_bot_profiles',
  );

  if (existing) {
    return single(
      supabase
        .from('wpm_bot_profiles')
        .update(toRecord(buildSeedBotProfilePayload(clientId, config)))
        .eq('id', existing.id)
        .select('id')
        .single(),
      'update wpm_bot_profiles',
    );
  }

  return single(
    supabase
      .from('wpm_bot_profiles')
      .insert(toRecord(buildSeedBotProfilePayload(clientId, config)))
      .select('id')
      .single(),
    'insert wpm_bot_profiles',
  );
}

async function upsertInstructions(supabase: SupabaseClientLike, botProfileId: string, config: WpmSeedConfig): Promise<{ id: string }> {
  const existing = await maybeSingle<{ id: string }>(
    supabase
      .from('wpm_bot_instructions')
      .select('id')
      .eq('bot_profile_id', botProfileId)
      .eq('version', 1)
      .maybeSingle(),
    'select wpm_bot_instructions',
  );

  if (existing) {
    return single(
      supabase
        .from('wpm_bot_instructions')
        .update(toRecord(buildSeedInstructionsPayload(botProfileId, config)))
        .eq('id', existing.id)
        .select('id')
        .single(),
      'update wpm_bot_instructions',
    );
  }

  return single(
    supabase
      .from('wpm_bot_instructions')
      .insert(toRecord(buildSeedInstructionsPayload(botProfileId, config)))
      .select('id')
      .single(),
    'insert wpm_bot_instructions',
  );
}

async function upsertKnowledge(supabase: SupabaseClientLike, clientId: string, botProfileId: string, config: WpmSeedConfig): Promise<string[]> {
  const ids: string[] = [];

  for (const row of buildSeedKnowledgePayloads(clientId, botProfileId, config)) {
    const seedKey = String(row.metadata.seed_key);
    const existing = await maybeSingle<{ id: string }>(
      supabase
        .from('wpm_knowledge_sources')
        .select('id')
        .eq('client_id', clientId)
        .eq('bot_profile_id', botProfileId)
        .contains('metadata', { seed_key: seedKey })
        .maybeSingle(),
      `select wpm_knowledge_sources ${seedKey}`,
    );

    const saved: { id: string } = existing
      ? await single(
        supabase
          .from('wpm_knowledge_sources')
          .update(toRecord(row))
          .eq('id', existing.id)
          .select('id')
          .single(),
        `update wpm_knowledge_sources ${seedKey}`,
      )
      : await single(
        supabase
          .from('wpm_knowledge_sources')
          .insert(toRecord(row))
          .select('id')
          .single(),
        `insert wpm_knowledge_sources ${seedKey}`,
      );

    ids.push(saved.id);
  }

  return ids;
}

async function upsertIntegration(supabase: SupabaseClientLike, clientId: string, config: WpmSeedConfig): Promise<{ id: string }> {
  const payload = buildSeedIntegrationPayload(clientId, config);
  const existing = await maybeSingle<{ id: string }>(
    supabase
      .from('wpm_integrations')
      .select('id')
      .eq('client_id', clientId)
      .eq('integration_type', payload.integration_type)
      .eq('secret_reference', payload.secret_reference)
      .maybeSingle(),
    'select wpm_integrations',
  );

  if (existing) {
    return single(
      supabase
        .from('wpm_integrations')
        .update(toRecord(payload))
        .eq('id', existing.id)
        .select('id')
        .single(),
      'update wpm_integrations',
    );
  }

  return single(
    supabase
      .from('wpm_integrations')
      .insert(toRecord(payload))
      .select('id')
      .single(),
    'insert wpm_integrations',
  );
}

async function main() {
  const args = parseArgs(Deno.args);
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? stringArg(args, 'supabase-url');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? stringArg(args, 'service-role-key');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars, or pass --supabase-url and --service-role-key.');
  }

  const config = buildConfigFromArgs(args);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const client = await upsertClient(supabase, config);
  const channel = await upsertChannel(supabase, client.id, config);
  const botProfile = await upsertBotProfile(supabase, client.id, config);
  const instructions = await upsertInstructions(supabase, botProfile.id, config);
  const knowledgeIds = await upsertKnowledge(supabase, client.id, botProfile.id, config);
  const integration = await upsertIntegration(supabase, client.id, config);

  console.log(JSON.stringify({
    ok: true,
    client_id: client.id,
    channel_id: channel.id,
    bot_profile_id: botProfile.id,
    instructions_id: instructions.id,
    knowledge_source_ids: knowledgeIds,
    integration_id: integration.id,
    provider_channel_id: config.providerChannelId,
    channel_type: config.channelType,
    next: config.providerChannelId === 'woztell-channel-placeholder'
      ? 'Re-run with --woztell-channel-id <real channel._id> before live Woztell testing.'
      : 'Point Woztell webhook/action to the deployed Supabase function and send a live test message.',
  }, null, 2));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  });
}
