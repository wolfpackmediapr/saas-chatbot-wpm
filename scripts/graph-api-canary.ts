/**
 * Graph API version canary.
 *
 * Calls the read-only endpoint shapes the edge functions depend on at two Graph
 * API versions and diffs the response structure. Any field the newer version
 * stopped returning shows up here as a key present at the old version and
 * missing at the new one — before it shows up in production as a silently null
 * customer name.
 *
 * Meta retires each Graph API version two years after release, so this is a
 * recurring migration. Run this before changing GRAPH_API_VERSION in
 * supabase/functions/_shared/wpm_meta_api.ts, and again after deploying.
 *
 * The page access token is read from the database and never printed.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... deno run --allow-env --allow-net \
 *     scripts/graph-api-canary.ts [oldVersion] [newVersion]
 *
 * Defaults to v20.0 → v26.0 (the 2026-08-10 migration).
 */

const SUPABASE_URL = 'https://upthfjkxbsqtipzoeecd.supabase.co';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const OLD = Deno.args[0] ?? 'v20.0';
const NEW = Deno.args[1] ?? 'v26.0';

if (!SERVICE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard → Settings → API).');
  Deno.exit(1);
}

// ── Pull the live page token, and never let it out of this process ──────────
const channelsResp = await fetch(
  `${SUPABASE_URL}/rest/v1/wpm_client_channels` +
    `?select=channel_type,external_page_id,page_access_token,is_active` +
    `&is_active=eq.true&provider=eq.meta`,
  { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
);

if (!channelsResp.ok) {
  console.error(`Could not read channels: ${channelsResp.status} ${await channelsResp.text()}`);
  Deno.exit(1);
}

const channels = await channelsResp.json() as Array<{
  channel_type: string;
  external_page_id: string;
  page_access_token: string;
}>;

const channel = channels.find((c) => c.page_access_token);
if (!channel) {
  console.error('No active meta channel with a page access token.');
  Deno.exit(1);
}

const TOKEN = channel.page_access_token;
const PAGE_ID = channel.external_page_id;
console.log(`Page ${PAGE_ID} · token present (${TOKEN.length} chars, not shown)\n`);

/** Recursively collect the key paths of a JSON value, so we compare shape not content. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix];
  if (Array.isArray(value)) {
    return value.length === 0 ? [`${prefix}[]`] : keyPaths(value[0], `${prefix}[]`);
  }
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k))
    .sort();
}

async function callBoth(label: string, path: string): Promise<boolean> {
  const results: Record<string, { status: number; paths: string[]; error?: string }> = {};

  for (const version of [OLD, NEW]) {
    const url = `https://graph.facebook.com/${version}${path}` +
      `${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(TOKEN)}`;
    try {
      const resp = await fetch(url);
      const body = await resp.json();
      results[version] = {
        status: resp.status,
        paths: keyPaths(body),
        error: body?.error ? `${body.error.code}: ${body.error.message}` : undefined,
      };
    } catch (e) {
      results[version] = { status: 0, paths: [], error: String(e) };
    }
  }

  const oldR = results[OLD];
  const newR = results[NEW];
  const oldSet = new Set(oldR.paths);
  const newSet = new Set(newR.paths);
  const lost = oldR.paths.filter((p) => !newSet.has(p));
  const gained = newR.paths.filter((p) => !oldSet.has(p));

  const verdict = newR.error
    ? `FAIL — ${NEW} errored: ${newR.error}`
    : lost.length === 0
    ? 'IDENTICAL SHAPE'
    : `CHANGED — fields missing at ${NEW}: ${lost.join(', ')}`;

  console.log(`${label}`);
  console.log(`  GET ${path}`);
  console.log(`  ${OLD}: HTTP ${oldR.status}${oldR.error ? ` (${oldR.error})` : ''}`);
  console.log(`  ${NEW}: HTTP ${newR.status}${newR.error ? ` (${newR.error})` : ''}`);
  if (gained.length) console.log(`  new fields at ${NEW}: ${gained.join(', ')}`);
  console.log(`  → ${verdict}\n`);

  return lost.length === 0 && !newR.error;
}

console.log(`Comparing ${OLD} → ${NEW}\n${'─'.repeat(60)}\n`);

const checks = [
  // Page identity via page token — the token itself must stay valid at the new version.
  await callBoth('1. Page identity', '/me?fields=id,name'),
  // The field list meta-oauth-callback and meta-fetch-pages request, minus `tasks`.
  //
  // Those two call GET /me/accounts?fields=...,tasks,... with a long-lived USER
  // token, where `tasks` describes what that user may do on the page. `tasks`
  // does not exist on the page node itself, so asking for it here with a PAGE
  // token returns "(#100) nonexisting field (tasks)" at EVERY version — it looks
  // like a migration failure but is purely an artifact of the canary's own
  // credentials. Reproducing /me/accounts would need an interactive OAuth flow
  // to mint a user token, which this script deliberately does not do; `tasks`
  // is therefore out of scope here. Verify it after deploying by connecting a
  // page through the real OAuth flow.
  await callBoth(
    '2. Page fields used by OAuth/page-fetch (minus `tasks`, see note)',
    `/${PAGE_ID}?fields=id,name,category,instagram_business_account{id,username}`,
  ),
  // Webhook subscription shape, read-only counterpart to meta-verify-webhooks.
  await callBoth('3. Webhook subscriptions', `/${PAGE_ID}/subscribed_apps`),
];

console.log('─'.repeat(60));
console.log(
  checks.every(Boolean)
    ? `PASS — ${NEW} returns the same shape for every endpoint we depend on.`
    : `REVIEW — at least one endpoint changed shape at ${NEW}. See above.`,
);

// The Send API (POST /me/messages) is deliberately not canaried: it would send
// a real message to a real customer. Verify it after deploying by sending an
// Instagram DM to the live account and confirming the agent replies.
Deno.exit(checks.every(Boolean) ? 0 : 1);
