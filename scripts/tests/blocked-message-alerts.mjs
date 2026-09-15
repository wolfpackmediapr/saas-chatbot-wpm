// Replays the blocked-message owner-alert migration against a real Postgres
// (pglite) and pins the cap: first 3 conversations per client, kind and period.
// Run with WPM_PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
import { readFileSync, readdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';

/** Resolve a migration by NAME, so a re-stamped version never breaks this suite. */
function migration(name) {
  const dir = 'supabase/migrations';
  const hits = readdirSync(dir).filter((f) => f.endsWith(`_${name}.sql`));
  if (hits.length !== 1) {
    throw new Error(`expected exactly one migration named ${name}, found ${hits.length}: ${hits.join(', ')}`);
  }
  return readFileSync(`${dir}/${hits[0]}`, 'utf8');
}

const { PGlite } = await import(process.env.WPM_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();

const clientA = '20000000-0000-0000-0000-000000000001';
const clientB = '20000000-0000-0000-0000-000000000002';
const conv = (n) => `30000000-0000-0000-0000-00000000000${n}`;

await db.exec(`
create role anon; create role authenticated;
-- Supabase's service_role BYPASSES RLS (verified in prod pg_roles 2026-09-15); a plain role
-- here would make the claim fail for a reason production never has.
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function public.is_super_admin() returns boolean language sql stable as $$ select false $$;
create table public.wpm_clients(id uuid primary key, owner_user_id uuid);
create table public.wpm_conversations(id uuid primary key);
insert into public.wpm_clients values ('${clientA}', null), ('${clientB}', null);
insert into public.wpm_conversations select ('30000000-0000-0000-0000-00000000000' || g)::uuid from generate_series(1, 9) g;
`);

await db.exec(migration('blocked_message_owner_alerts'));
await db.exec(`
grant usage on schema public to service_role;
grant select, insert, update, delete on public.wpm_blocked_message_alerts to service_role;
set role service_role;
`);

const claim = async (client, kind, period, conversation) =>
  (await db.query('select public.claim_blocked_message_alert($1, $2, $3, $4, 3) as slot',
    [client, kind, period, conversation])).rows[0].slot;

// First three conversations take slots 1..3; the fourth gets nothing.
assert.equal(await claim(clientA, 'trial_expired', 'trial:x', conv(1)), 1);
assert.equal(await claim(clientA, 'trial_expired', 'trial:x', conv(2)), 2);
assert.equal(await claim(clientA, 'trial_expired', 'trial:x', conv(3)), 3);
assert.equal(await claim(clientA, 'trial_expired', 'trial:x', conv(4)), null);

// The same conversation never takes a second slot, even with slots free.
assert.equal(await claim(clientA, 'plan_limit', 'month:2026-09', conv(1)), 1);
assert.equal(await claim(clientA, 'plan_limit', 'month:2026-09', conv(1)), null);

// A new period, another kind, or another client each start from slot 1.
assert.equal(await claim(clientA, 'plan_limit', 'month:2026-10', conv(1)), 1);
assert.equal(await claim(clientA, 'conversation_cap', 'day:2026-09-15', conv(4)), 1);
assert.equal(await claim(clientB, 'trial_expired', 'trial:x', conv(5)), 1);

// Releasing a slot (a failed send) makes it available again.
await db.query(`delete from public.wpm_blocked_message_alerts
  where client_id = $1 and kind = 'trial_expired' and period_key = 'trial:x' and slot = 2`, [clientA]);
assert.equal(await claim(clientA, 'trial_expired', 'trial:x', conv(6)), 2);
assert.equal(await claim(clientA, 'trial_expired', 'trial:x', conv(7)), null);

const total = (await db.query(`select count(*)::integer n from public.wpm_blocked_message_alerts
  where client_id = $1 and kind = 'trial_expired' and period_key = 'trial:x'`, [clientA])).rows[0].n;
assert.equal(total, 3, 'the trial period must never hold more than 3 alerts');

// Only service_role may claim — CREATE FUNCTION's default PUBLIC grant is revoked.
await db.exec('reset role;');
const fn = 'public.claim_blocked_message_alert(uuid,text,text,uuid,integer)';
for (const role of ['anon', 'authenticated']) {
  const allowed = (await db.query(`select has_function_privilege('${role}', '${fn}', 'execute') as allowed`)).rows[0].allowed;
  assert.equal(allowed, false, `${role} must not be able to claim alert slots`);
}
assert.equal((await db.query(`select has_function_privilege('service_role', '${fn}', 'execute') as allowed`)).rows[0].allowed, true);

console.log('blocked-message-alerts: ok');
