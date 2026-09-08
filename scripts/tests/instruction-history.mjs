// Run with WPM_PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
import { readFileSync, readdirSync } from 'node:fs';

/**
 * Resolve a migration by its NAME, not its timestamp.
 *
 * apply_migration stamps its own version, so a local file gets renamed to the
 * registered one after it is applied (handbook: "apply_migration stamps its own
 * timestamp — rename the local file"). Hardcoding the filename here made this
 * suite fail the moment that correct rename happened. Match on the suffix so the
 * test survives any future re-stamp.
 */
function migration(name) {
  const dir = 'supabase/migrations';
  const hits = readdirSync(dir).filter((f) => f.endsWith(`_${name}.sql`));
  if (hits.length !== 1) {
    throw new Error(`expected exactly one migration named ${name}, found ${hits.length}: ${hits.join(', ')}`);
  }
  return readFileSync(`${dir}/${hits[0]}`, 'utf8');
}
import { strict as assert } from 'node:assert';
const { PGlite } = await import(process.env.WPM_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const alice='00000000-0000-0000-0000-000000000001';
const bob='00000000-0000-0000-0000-000000000002';
const a='10000000-0000-0000-0000-000000000001';
const b='10000000-0000-0000-0000-000000000002';
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function public.is_super_admin() returns boolean language sql stable as $$ select false $$;
create table wpm_clients(id uuid primary key,owner_user_id uuid);
create table wpm_bot_profiles(id uuid primary key,client_id uuid,owner_user_id uuid);
create table wpm_bot_instructions(
 id uuid primary key default gen_random_uuid(),bot_profile_id uuid,owner_user_id uuid,
 system_prompt text,business_summary text,faq_instructions text,lead_qualification_instructions text,
 handoff_rules text,never_say_rules text,primary_goal text,response_language text,
 emergency_keywords text[],lead_fields jsonb,is_active boolean,version integer,
 created_at timestamptz default now(),updated_at timestamptz default now()
);
create unique index one_active on wpm_bot_instructions(bot_profile_id) where is_active;
alter table wpm_clients enable row level security;
alter table wpm_bot_profiles enable row level security;
alter table wpm_bot_instructions enable row level security;
create policy owned_clients on wpm_clients to authenticated using(owner_user_id=auth.uid()) with check(owner_user_id=auth.uid());
create policy owned_bots on wpm_bot_profiles to authenticated using(owner_user_id=auth.uid()) with check(owner_user_id=auth.uid());
create policy owned_instructions on wpm_bot_instructions to authenticated using(owner_user_id=auth.uid()) with check(owner_user_id=auth.uid());
grant usage on schema public,auth to authenticated,anon;
grant select,insert,update,delete on all tables in schema public to authenticated;
insert into wpm_clients values('${a}','${alice}'),('${b}','${bob}');
insert into wpm_bot_profiles values('${a}','${a}','${alice}'),('${b}','${b}','${bob}');
`);
await db.exec(migration('preserve_instruction_history'));
await db.exec(`set role authenticated; set request.jwt.claim.sub='${alice}';`);
const save=(id,updates,version)=>db.query('select save_wpm_bot_instructions($1,$2,$3)',[id,JSON.stringify(updates),version]);
await save(a,{system_prompt:'Original',handoff_rules:'Escalate safely'},0);
await save(a,{system_prompt:'Revised'},1);
let rows=(await db.query('select system_prompt,handoff_rules,is_active,version from wpm_bot_instructions order by version')).rows;
assert.deepEqual(rows,[{system_prompt:'Original',handoff_rules:'Escalate safely',is_active:false,version:1},{system_prompt:'Revised',handoff_rules:'Escalate safely',is_active:true,version:2}]);
await assert.rejects(save(b,{system_prompt:'Cross-tenant attack'},0));
await assert.rejects(save(a,{system_prompt:'Stale edit'},1));
await assert.rejects(save(a,{emergency_keywords:'invalid array'},2));
rows=(await db.query('select system_prompt from wpm_bot_instructions where is_active')).rows;
assert.deepEqual(rows,[{system_prompt:'Revised'}]);
await db.exec(`set request.jwt.claim.sub='${bob}';`);
assert.equal((await db.query('select count(*)::integer n from wpm_bot_instructions')).rows[0].n,0);
await save(b,{system_prompt:'Bob only'},0);
await db.exec('reset role;');
assert.equal((await db.query("select has_function_privilege('anon','public.save_wpm_bot_instructions(uuid,jsonb,integer)','execute') allowed")).rows[0].allowed,false);
// Tier limits are account-wide and must remain the published values.
await db.exec(`create table subscriptions(user_id uuid,plan text,status text); create table app_admins(user_id uuid);`);
await db.exec(migration('align_max_bots_with_pricing_page'));
for(const [plan,channels,bots] of [['free',2,1],['starter',1,1],['growth',3,2],['pro',10,3],['agency',null,10]]) {
 await db.query('delete from subscriptions');
 await db.query('insert into subscriptions values($1,$2,$3)',[bob,plan,'active']);
 const r=(await db.query('select * from get_plan_limits($1)',[bob])).rows[0];
 assert.deepEqual(r,{max_channels:channels,max_bots:bots});
}
// Exercise lead capture against a real PostgreSQL engine in memory.
await db.exec(`
set request.jwt.claim.sub='';
create role service_role bypassrls;
create table wpm_conversations(id uuid primary key,client_id uuid,created_at timestamptz default now());
create table wpm_messages(id uuid primary key default gen_random_uuid(),conversation_id uuid,client_id uuid,direction text,token_usage jsonb,created_at timestamptz default now());
create table wpm_leads(id uuid primary key default gen_random_uuid(),client_id uuid,conversation_id uuid,
 full_name text,email text,phone text,service_interest text,intent text,qualification_data jsonb,
 source_channel text,status text,last_contact_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
`);
await db.exec(migration('free_trial_expiry'));
await db.exec(migration('get_wpm_usage_revoke_public_execute'));
assert.equal((await db.query("select has_function_privilege('anon','public.get_wpm_usage(uuid)','execute') allowed")).rows[0].allowed,false);
await db.exec(migration('lead_capture_entitlements'));
const a2='10000000-0000-0000-0000-000000000003';
await db.query('insert into wpm_clients values($1,$2)',[a2,alice]);
await db.query('insert into subscriptions values($1,$2,$3)',[alice,'starter','active']);
await db.exec('grant select,insert,update on all tables in schema public to service_role; grant usage on schema auth to service_role;');
const capture=async(client,conversation,lead={})=>db.query('select capture_wpm_lead($1,$2,$3) result',[client,conversation,JSON.stringify(lead)]);
const convs=[];
for(let i=0;i<51;i++) {
 const id=`20000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`;
 const client=i<25?a:a2;
 await db.query('insert into wpm_conversations(id,client_id) values($1,$2)',[id,client]);
 convs.push([client,id]);
}
await db.exec('set role service_role');
for(let i=0;i<50;i++) assert.equal((await capture(...convs[i])).rows[0].result.created,true);
await assert.rejects(capture(...convs[50]),/LEAD_MONTHLY_LIMIT/);
assert.equal((await capture(...convs[0],{email:'updated@example.test'})).rows[0].result.created,false);
assert.equal((await db.query('select count(*)::integer n from wpm_leads')).rows[0].n,50);
await assert.rejects(capture(b,convs[0][1]),/Conversation does not belong/);
await db.exec('reset role');
for(const plan of ['growth','pro','agency']) {
 await db.query('update subscriptions set plan=$1 where user_id=$2',[plan,alice]);
 // An existing lead update stays deduplicated after upgrade.
 assert.equal((await capture(...convs[0])).rows[0].result.created,false);
}
assert.equal((await capture(...convs[50])).rows[0].result.created,true);
// Free trial is allowed before expiry and blocked afterwards.
await db.query('update subscriptions set plan=$1 where user_id=$2',['free',bob]);
const trialConv='30000000-0000-0000-0000-000000000001';
await db.query('insert into wpm_conversations(id,client_id) values($1,$2)',[trialConv,b]);
assert.equal((await capture(b,trialConv)).rows[0].result.created,true);
await db.query("insert into wpm_messages(conversation_id,client_id,direction,created_at) values($1,$2,'inbound',now()-interval '8 days')",[trialConv,b]);
const expiredConv='30000000-0000-0000-0000-000000000002';
await db.query('insert into wpm_conversations(id,client_id) values($1,$2)',[expiredConv,b]);
await assert.rejects(capture(b,expiredConv),/LEAD_TRIAL_EXHAUSTED/);
assert.equal((await db.query("select has_function_privilege('authenticated','public.capture_wpm_lead(uuid,uuid,jsonb)','execute') allowed")).rows[0].allowed,false);
console.log('PASS: security migration replay, Starter 50 across businesses, deduplication, upgrades, trial expiry, cross-tenant conversation rejection');
// Preserve the ordinary Agency entitlement and the distinct super-admin bypass.
await db.query('update subscriptions set plan=$1 where user_id=$2',['agency',bob]);
assert.deepEqual((await db.query('select * from get_plan_limits($1)',[bob])).rows[0],{max_channels:null,max_bots:10});
await db.query('insert into app_admins values($1)',[alice]);
assert.deepEqual((await db.query('select * from get_plan_limits($1)',[alice])).rows[0],{max_channels:null,max_bots:null});
console.log('PASS: Agency test account retains 10 bots; super admin retains unlimited bot/channel permissions');
// An outbound blast is not 69 conversations. A conversation counts against an
// allowance only once the customer has spoken in it; until then it is broadcast.
// Regression for 2026-09-07, when one shared Instagram post to 69 accounts took
// the month from 8 conversations to 77 with nobody having written a word.
await db.exec(migration('bill_only_conversations_the_customer_joined'));
assert.equal((await db.query("select has_function_privilege('anon','public.get_wpm_usage(uuid)','execute') allowed")).rows[0].allowed,false);

const carol='00000000-0000-0000-0000-000000000003';
const cc='10000000-0000-0000-0000-000000000009';
await db.query('insert into wpm_clients values($1,$2)',[cc,carol]);
await db.query('insert into subscriptions values($1,$2,$3)',[carol,'free','active']);
const conv=async(id,directions)=>{
 await db.query('insert into wpm_conversations(id,client_id) values($1,$2)',[id,cc]);
 for(const d of directions) await db.query('insert into wpm_messages(conversation_id,client_id,direction) values($1,$2,$3)',[id,cc,d]);
};
const blast1='40000000-0000-0000-0000-000000000001';
const blast2='40000000-0000-0000-0000-000000000002';
const real  ='40000000-0000-0000-0000-000000000003';
await conv(blast1,['outbound']);          // echo of a broadcast, never answered
await conv(blast2,['outbound']);          // ditto

// A pure broadcast: two threads exist, nobody has replied to either. This is the
// exact 2026-09-07 shape, and it must cost nothing on any meter.
const usage=async(u)=>(await db.query('select * from get_wpm_usage($1)',[u])).rows[0];
let r=await usage(carol);
assert.equal(r.conversations_used,0,'a thread nobody joined is not a conversation');
assert.equal(r.messages_lifetime,0,'broadcast echoes do not burn the free grant');
assert.equal(r.messages_out,2,'descriptive stats still show the blast happened');
assert.equal(r.free_trial_started_at,null,'outbound-only traffic must never start the 7-day clock');

await conv(real,['outbound','inbound']);  // this recipient actually replied
r=await usage(carol);
assert.equal(r.conversations_used,1,'only the conversation the customer joined is billable');
assert.equal(r.messages_lifetime,2,'and only its messages count -- both directions');
assert.equal(r.messages_out,3);
assert.equal(r.messages_in,1);

// Self-correcting: the moment a recipient answers, that thread becomes billable
// and its earlier outbound message counts too. Nothing is forgiven by hand.
await db.query("insert into wpm_messages(conversation_id,client_id,direction) values($1,$2,'inbound')",[blast1,cc]);
r=await usage(carol);
assert.equal(r.conversations_used,2);
assert.equal(r.messages_lifetime,4);
assert.notEqual(r.free_trial_started_at,null,'a real inbound message does start the trial clock');

// The paid meter is gated on the same definition.
await db.query('update subscriptions set plan=$1 where user_id=$2',['starter',carol]);
r=await usage(carol);
assert.equal(r.conversations_used,2);
assert.equal(r.max_conversations,500);
assert.equal(r.within_allowance,true);
console.log('PASS: outbound-only threads are not billable, descriptive counts unchanged, billing self-corrects on reply');

// Trial expiry notices. The unique key is the only thing preventing a duplicate
// email, so it is pinned here against a real Postgres engine rather than a stub.
// The stub wpm_clients above carries only what earlier tests needed; the notice
// query reads the business name off it, as production does.
await db.exec(`
create table auth.users(id uuid primary key, email text, deleted_at timestamptz);
alter table wpm_clients add column if not exists name text;
alter table wpm_clients add column if not exists created_at timestamptz default now();
`);
await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[carol,'carol@example.test',bob,'bob@example.test']);
await db.exec(migration('trial_expiry_notifications').replace(/select cron\.schedule\([\s\S]*?\);\s*$/,''));

// Carol is on the free grant with the clock started; her trial has 7 days to run
// from that first inbound message, so nothing is due yet.
await db.query('update subscriptions set plan=$1 where user_id=$2',['free',carol]);
const due=async()=>(await db.query('select * from wpm_trial_notifications_due() order by user_id')).rows;
assert.equal((await due()).length,0,'a trial with days left owes nobody an email');

// Move her first inbound message back so the clock ends in under 24 hours.
await db.query("update wpm_messages set created_at=now()-interval '6 days 6 hours' where direction='inbound' and client_id=$1",[cc]);
let d=await due();
assert.equal(d.length,1);
assert.equal(d[0].kind,'expiring_soon');
assert.equal(d[0].email,'carol@example.test');

// Recording the notice removes it from the due list -- this is the dedupe.
await db.query('insert into wpm_trial_notifications(user_id,kind,trial_ends_at,email) values($1,$2,$3,$4)',
 [carol,'expiring_soon',d[0].trial_ends_at,d[0].email]);
assert.equal((await due()).length,0,'a recorded notice is never due again');
await assert.rejects(
 db.query('insert into wpm_trial_notifications(user_id,kind,trial_ends_at,email) values($1,$2,$3,$4)',
  [carol,'expiring_soon',d[0].trial_ends_at,d[0].email]),
 /duplicate key/,'the unique key must make a second send impossible');

// Past the end of the 7 days it becomes the expired notice, which is a separate
// kind and therefore separately due even though the warning already went out.
await db.query("update wpm_messages set created_at=now()-interval '8 days' where direction='inbound' and client_id=$1",[cc]);
d=await due();
assert.equal(d.length,1);
assert.equal(d[0].kind,'expired');

// A paid account is never owed a trial email, whatever its dates say.
await db.query('update subscriptions set plan=$1 where user_id=$2',['growth',carol]);
assert.equal((await due()).length,0,'a paying customer must never be told their trial ended');
// Nor is a super admin: alice was made an app_admin above.
await db.query('update subscriptions set plan=$1 where user_id=$2',['free',alice]);
assert.equal((await due()).filter(r=>r.user_id===alice).length,0,'an admin has no trial to expire');
assert.equal((await db.query("select has_function_privilege('authenticated','public.wpm_trial_notifications_due()','execute') allowed")).rows[0].allowed,false);
console.log('PASS: trial notices are due once per cycle, dedupe by unique key, and never reach paid or admin accounts');

// ── The grant half, and the priority between the two halves ─────────────────
await db.exec(migration('grant_exhaustion_notices'));
await db.query('update subscriptions set plan=$1 where user_id=$2',['free',carol]);
// Put her clock back in the middle of the trial so the CALENDAR is not a factor
// and the grant is the only thing that can fire.
await db.query("update wpm_messages set created_at=now()-interval '2 days' where direction='inbound' and client_id=$1",[cc]);
assert.equal((await due()).length,0,'mid-trial with a nearly-empty grant owes nothing');

// Fill the billable conversation to 90% of the 1,000-message grant. Messages
// must live in a conversation the customer joined, or the 09-07 billing rule
// correctly refuses to count them -- which is itself worth pinning.
const bulk=async(n)=>{
 for(let i=0;i<n;i++) await db.query("insert into wpm_messages(conversation_id,client_id,direction) values($1,$2,'outbound')",[real,cc]);
};
// Top up to an exact figure rather than adding a hardcoded count: earlier tests
// in this file already put billable messages on this account, and hardcoding the
// delta silently drifts the moment one of them changes.
const lifetime=async()=>(await usage(carol)).messages_lifetime;
const topUpTo=async(target)=>{ const n=target-await lifetime(); assert.ok(n>=0,'already past target'); await bulk(n); };
await topUpTo(900);
d=await due();
assert.equal(d.length,1);
assert.equal(d[0].kind,'grant_low','90% of the grant with days left is grant_low, not expiring_soon');
assert.equal(d[0].messages_used,900);
assert.equal(d[0].messages_limit,1000);

await db.query('insert into wpm_trial_notifications(user_id,kind,trial_ends_at,email) values($1,$2,$3,$4)',
 [carol,'grant_low',d[0].trial_ends_at,d[0].email]);
assert.equal((await due()).length,0,'a recorded grant_low is not due again');

// Spend the rest of the grant.
await topUpTo(1000);
d=await due();
assert.equal(d.length,1);
assert.equal(d[0].kind,'grant_exhausted');
assert.equal(d[0].messages_used,1000);

// PRIORITY: grant exhaustion outranks the calendar WARNING. With the allowance
// already spent the agent has stopped, so "your trial ends tomorrow" would
// describe a future that has already arrived.
await db.query("update wpm_messages set created_at=now()-interval '6 days 6 hours' where direction='inbound' and client_id=$1",[cc]);
d=await due();
assert.equal(d[0].kind,'grant_exhausted','grant exhaustion must outrank the 24h calendar warning');

// PRIORITY: an expired calendar outranks everything -- the trial really is over.
await db.query("update wpm_messages set created_at=now()-interval '8 days' where direction='inbound' and client_id=$1",[cc]);
d=await due();
assert.equal(d[0].kind,'expired','an expired calendar outranks a spent grant');

// And a paid account is still never owed any of the four.
await db.query('update subscriptions set plan=$1 where user_id=$2',['growth',carol]);
assert.equal((await due()).length,0,'a paying customer is owed no trial notice of any kind');
console.log('PASS: grant_low at 90%, grant_exhausted at 100%, and priority expired > grant_exhausted > expiring_soon');

await db.close();
console.log('PASS: instruction history, rollback, ownership isolation, anonymous denial, stale revision, all five tier limits');
