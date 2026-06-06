interface SupabaseLike {
  from(table: string): any;
}

type EnvGetter = (name: string) => string | undefined;

export interface ReadinessCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface WpmBridgeReadinessReport {
  ok: boolean;
  mode: 'full' | 'local_no_supabase' | 'partial';
  checks: ReadinessCheck[];
  summary: string;
  timestamp: string;
}

export async function checkWpmBridgeReadiness(
  supabase: SupabaseLike | null = null,
  getEnv: EnvGetter = (name: string) => (globalThis as any).Deno?.env?.get?.(name),
): Promise<WpmBridgeReadinessReport> {
  const checks: ReadinessCheck[] = [];
  const timestamp = new Date().toISOString();

  // Env presence checks only - never expose values
  const requiredEnvs = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY',
    'WOZTELL_BOT_API_ACCESS_TOKEN',
    'WPM_ACTION_PROCESSOR_SECRET',
  ];

  for (const key of requiredEnvs) {
    const present = !!getEnv(key);
    checks.push({
      name: key,
      ok: present,
      detail: present ? 'present' : 'missing',
    });
  }

  if (!supabase) {
    const envOk = checks.every((c) => c.ok);
    return {
      ok: false,
      mode: 'local_no_supabase',
      checks,
      summary: 'No Supabase admin client provided; cannot verify DB configuration/mapping rows. Env checks only.',
      timestamp,
    };
  }

  // Conceptual required configuration/mapping rows from wpm_bridge_schema
  // Use count/head for read-only minimal impact. Report existence conceptually.
  const dbRowChecks: Array<{ table: string; label: string; filters: Record<string, unknown> }> = [
    { table: 'wpm_clients', label: 'wpm_clients (any status for launch base)', filters: {} },
    { table: 'wpm_client_channels', label: 'wpm_client_channels (active mappings)', filters: { is_active: true } },
    { table: 'wpm_bot_profiles', label: 'wpm_bot_profiles (active)', filters: { is_active: true } },
    { table: 'wpm_bot_instructions', label: 'wpm_bot_instructions (active)', filters: { is_active: true } },
    { table: 'wpm_integrations', label: 'wpm_integrations (mapping placeholders)', filters: {} },
  ];

  let dbQueryError = false;

  for (const { table, label, filters } of dbRowChecks) {
    try {
      let query = supabase.from(table).select('id', { count: 'exact', head: true });
      for (const [col, val] of Object.entries(filters)) {
        query = query.eq(col, val);
      }
      const { count, error } = await query;
      if (error) {
        dbQueryError = true;
        checks.push({ name: label, ok: false, detail: `query error: ${error.message ?? error}` });
        continue;
      }
      const rowCount = count ?? 0;
      const exists = rowCount > 0;
      checks.push({
        name: label,
        ok: exists,
        detail: exists ? `${rowCount} row(s)` : '0 rows (no config yet)',
      });
    } catch (err) {
      dbQueryError = true;
      const msg = err instanceof Error ? err.message : String(err);
      checks.push({ name: label, ok: false, detail: `exception: ${msg}` });
    }
  }

  const envOk = checks.slice(0, requiredEnvs.length).every((c) => c.ok);
  const dbChecks = checks.slice(requiredEnvs.length);
  const dbOk = dbChecks.every((c) => c.ok) && !dbQueryError;
  const overallOk = envOk && dbOk;

  const mode: 'full' | 'partial' = overallOk ? 'full' : 'partial';
  const missing = checks.filter((c) => !c.ok).map((c) => c.name);
  const summary = overallOk
    ? 'All required local configuration and mapping rows exist conceptually for WPM bridge launch readiness.'
    : `Readiness incomplete. Missing: ${missing.length > 0 ? missing.join(', ') : 'DB/env issues'}.`;

  return {
    ok: overallOk,
    mode,
    checks,
    summary,
    timestamp,
  };
}
