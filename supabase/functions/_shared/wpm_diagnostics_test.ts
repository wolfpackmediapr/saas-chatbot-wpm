import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  checkWpmBridgeReadiness,
  type WpmBridgeReadinessReport,
} from './wpm_diagnostics.ts';

class QueryStub {
  private table: string;
  private db: Record<string, unknown>;
  private filters: Record<string, unknown> = {};

  constructor(table: string, db: Record<string, unknown>) {
    this.table = table;
    this.db = db;
  }

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  // Make the builder thenable so `const { count, error } = await query` works without terminal method
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): PromiseLike<TResult1 | TResult2> {
    const keyBase = `${this.table}:count`;
    const filterKey = Object.keys(this.filters).length > 0 ? JSON.stringify(this.filters) : 'all';
    const countKey = `${keyBase}:${filterKey}`;
    const count = (this.db[countKey] as number) ?? (this.db[keyBase] as number) ?? 0;
    const err = this.db[`${this.table}:error`] ?? null;
    const result = err
      ? { count: null, error: err, data: null }
      : { count, error: null, data: null };
    const p = Promise.resolve(result);
    return p.then(onfulfilled as any, onrejected as any);
  }
}

class SupabaseStub {
  db: Record<string, unknown>;

  constructor(db: Record<string, unknown>) {
    this.db = db;
  }

  from(table: string) {
    return new QueryStub(table, this.db);
  }
}

Deno.test('checkWpmBridgeReadiness reports env presence only (never values) and DB row existence conceptually', async () => {
  const getEnv = (name: string) => {
    if (name === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (name === 'SUPABASE_SERVICE_ROLE_KEY') return 'sb_secret_xxx';
    if (name === 'OPENAI_API_KEY') return 'sk-xxx';
    if (name === 'WOZTELL_BOT_API_ACCESS_TOKEN') return 'token-xxx';
    if (name === 'WPM_ACTION_PROCESSOR_SECRET') return 'action-secret-xxx';
    return undefined;
  };

  const channelFilter = { is_active: true };
  const profileFilter = { is_active: true };
  const instrFilter = { is_active: true };
  const supabase = new SupabaseStub({
    'wpm_clients:count:all': 1,
    [`wpm_client_channels:count:${JSON.stringify(channelFilter)}`]: 1,
    [`wpm_bot_profiles:count:${JSON.stringify(profileFilter)}`]: 1,
    [`wpm_bot_instructions:count:${JSON.stringify(instrFilter)}`]: 1,
    'wpm_integrations:count:all': 1,
  });

  const report = await checkWpmBridgeReadiness(supabase as any, getEnv);

  assertEquals(report.ok, true);
  assertEquals(report.mode, 'full');
  assertStringIncludes(report.summary, 'All required local configuration and mapping rows exist conceptually for WPM bridge launch readiness.');

  // verify no secret values leaked
  const reportStr = JSON.stringify(report);
  assertEquals(reportStr.includes('sk-xxx'), false);
  assertEquals(reportStr.includes('token-xxx'), false);
  assertEquals(reportStr.includes('action-secret-xxx'), false);
  assertEquals(reportStr.includes('sb_secret_xxx'), false);

  const envChecks = report.checks.filter((c) => !c.name.includes('wpm_'));
  assertEquals(envChecks.length, 5);
  assertEquals(envChecks.every((c) => c.ok === true && c.detail === 'present'), true);

  const dbChecks = report.checks.filter((c) => c.name.includes('wpm_'));
  assertEquals(dbChecks.length, 5);
  assertEquals(dbChecks.every((c) => c.ok === true), true);
});

Deno.test('checkWpmBridgeReadiness detects missing env and missing config rows', async () => {
  const getEnv = (name: string) => (name === 'SUPABASE_URL' ? 'https://ex' : undefined);

  const channelFilter = { is_active: true };
  const profileFilter = { is_active: true };
  const instrFilter = { is_active: true };
  const supabase = new SupabaseStub({
    'wpm_clients:count:all': 0,
    [`wpm_client_channels:count:${JSON.stringify(channelFilter)}`]: 0,
    [`wpm_bot_profiles:count:${JSON.stringify(profileFilter)}`]: 0,
    [`wpm_bot_instructions:count:${JSON.stringify(instrFilter)}`]: 1,
    'wpm_integrations:count:all': 0,
  });

  const report = await checkWpmBridgeReadiness(supabase as any, getEnv);

  assertEquals(report.ok, false);
  assertEquals(report.mode, 'partial');
  assertStringIncludes(report.summary, 'Readiness incomplete');

  const missingStr = report.checks.filter((c) => !c.ok).map((c) => c.name).join(',');
  assertStringIncludes(missingStr, 'OPENAI_API_KEY');
  assertStringIncludes(missingStr, 'WOZTELL_BOT_API_ACCESS_TOKEN');
  assertStringIncludes(missingStr, 'WPM_ACTION_PROCESSOR_SECRET');
  assertStringIncludes(missingStr, 'wpm_clients (any status for launch base)');
  assertStringIncludes(missingStr, 'wpm_client_channels (active mappings)');
  assertStringIncludes(missingStr, 'wpm_bot_profiles (active)');
  assertStringIncludes(missingStr, 'wpm_integrations (mapping placeholders)');

  // instructions present
  const instr = report.checks.find((c) => c.name.includes('instructions'));
  assertEquals(instr?.ok, true);
});

Deno.test('checkWpmBridgeReadiness handles no supabase client (local mode)', async () => {
  const getEnv = (name: string) => (name === 'SUPABASE_URL' ? 'https://ex' : undefined);
  const report = await checkWpmBridgeReadiness(null, getEnv);

  assertEquals(report.ok, false);
  assertEquals(report.mode, 'local_no_supabase');
  assertStringIncludes(report.summary, 'No Supabase admin client provided');
  assertEquals(report.checks.some((c) => c.name === 'SUPABASE_URL'), true);
});

Deno.test('checkWpmBridgeReadiness never includes secret values in any output', async () => {
  const getEnv = (name: string) => (name.includes('KEY') || name.includes('TOKEN') || name.includes('SECRET') ? 'REDACTED-SECRET-VALUE' : 'https://ok');
  const supabase = new SupabaseStub({ 'wpm_clients:count:all': 0 });

  const report = await checkWpmBridgeReadiness(supabase as any, getEnv);
  const str = JSON.stringify(report) + report.summary;
  assertEquals(str.includes('REDACTED-SECRET-VALUE'), false);
  assertEquals(str.includes('sk-'), false);
});
