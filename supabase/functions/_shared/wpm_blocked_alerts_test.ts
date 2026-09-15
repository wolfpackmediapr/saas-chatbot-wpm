import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  alertOwnerOfBlockedMessage,
  blockedAlertKind,
  blockedAlertPeriodKey,
  MAX_BLOCKED_ALERTS_PER_PERIOD,
} from './wpm_blocked_alerts.ts';
import { type BlockedAlertEmail, type BlockedAlertKind, buildBlockedAlertEmail } from './wpm_email.ts';
import type { ConversationAllowance } from './wpm_usage.ts';

/**
 * Stub shaped like the calls the module makes: the claiming RPC (which mimics
 * the two unique keys in SQL), the client lookup, the handoff-contact lookup,
 * the owner lookup, and the delete/update on the ledger.
 */
function makeSupabase(opts: {
  client?: { name: string | null; owner_user_id: string | null } | null;
  ownerEmail?: string | null;
  handoffContact?: string | null;
  claimError?: string;
} = {}) {
  type Row = { client_id: unknown; kind: unknown; period_key: unknown; conversation_id: unknown; slot: number };
  const ledger: Row[] = [];
  const released: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  const lookups: string[] = [];

  return {
    ledger,
    released,
    updates,
    lookups,
    rpc(_fn: string, a: Record<string, unknown> = {}) {
      if (opts.claimError) return Promise.resolve({ data: null, error: { message: opts.claimError } });
      const same = ledger.filter((r) =>
        r.client_id === a.p_client_id && r.kind === a.p_kind && r.period_key === a.p_period_key
      );
      if (same.some((r) => r.conversation_id === a.p_conversation_id)) {
        return Promise.resolve({ data: null, error: null });
      }
      for (let s = 1; s <= (a.p_max as number); s++) {
        if (!same.some((r) => r.slot === s)) {
          ledger.push({
            client_id: a.p_client_id,
            kind: a.p_kind,
            period_key: a.p_period_key,
            conversation_id: a.p_conversation_id,
            slot: s,
          });
          return Promise.resolve({ data: s, error: null });
        }
      }
      return Promise.resolve({ data: null, error: null });
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let op: 'select' | 'update' | 'delete' = 'select';
      let patch: unknown = null;
      const chain = {
        select(_c: string) {
          return chain;
        },
        update(p: unknown) {
          op = 'update';
          patch = p;
          return chain;
        },
        delete() {
          op = 'delete';
          return chain;
        },
        eq(c: string, v: unknown) {
          filters[c] = v;
          return chain;
        },
        maybeSingle() {
          lookups.push(table);
          if (table === 'wpm_clients') {
            return Promise.resolve({
              data: opts.client === undefined ? { name: 'In House Chef', owner_user_id: 'owner-1' } : opts.client,
              error: null,
            });
          }
          if (table === 'wpm_bot_profiles') {
            return Promise.resolve({ data: { handoff_contact: opts.handoffContact ?? null }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve: (v: unknown) => void) {
          if (op === 'delete') {
            released.push({ ...filters });
            const i = ledger.findIndex((r) =>
              r.client_id === filters.client_id && r.kind === filters.kind &&
              r.period_key === filters.period_key && r.slot === filters.slot
            );
            if (i >= 0) ledger.splice(i, 1);
          }
          if (op === 'update') updates.push({ ...filters, patch });
          resolve({ error: null });
        },
      };
      return chain;
    },
    auth: {
      admin: {
        getUserById(_id: string) {
          lookups.push('auth.users');
          return Promise.resolve({
            data: { user: opts.ownerEmail === null ? null : { email: opts.ownerEmail ?? 'owner@example.com' } },
            error: null,
          });
        },
      },
    },
  };
}

const trial: ConversationAllowance = {
  allowed: false,
  used: 37,
  max: 1000,
  reason: 'trial_expired',
  meter: 'free_grant',
  trialEndsAt: '2026-09-09T17:39:39.564Z',
};
const grant: ConversationAllowance = { allowed: false, used: 1000, max: 1000, reason: 'account_allowance', meter: 'free_grant' };
const plan: ConversationAllowance = { allowed: false, used: 500, max: 500, reason: 'account_allowance', meter: 'plan' };
const cap: ConversationAllowance = { allowed: false, used: 30, max: 30, reason: 'conversation_cap' };

type Sent = Array<{ to: string; email: BlockedAlertEmail }>;

function alert(
  supabase: ReturnType<typeof makeSupabase>,
  allowance: ConversationAllowance,
  conversationId: string,
  sent: Sent,
  extra: Partial<Parameters<typeof alertOwnerOfBlockedMessage>[0]> = {},
) {
  return alertOwnerOfBlockedMessage({
    supabase,
    allowance,
    clientId: 'client-1',
    conversationId,
    botProfileId: 'bot-1',
    customerName: '@mariamorazzani',
    channelLabel: 'Instagram',
    lastMessage: 'Hola. Aun sin recibir llamada',
    now: new Date('2026-09-15T10:22:50Z'),
    send: (to, email) => {
      sent.push({ to, email });
      return Promise.resolve({ sent: true });
    },
    ...extra,
  });
}

// ── Which email, which window ───────────────────────────────────────────────

Deno.test('each block maps to its own alert kind, and a free grant is not a paid plan', () => {
  assertEquals(blockedAlertKind(trial), 'trial_expired');
  assertEquals(blockedAlertKind(grant), 'grant_exhausted');
  assertEquals(blockedAlertKind(plan), 'plan_limit');
  assertEquals(blockedAlertKind(cap), 'conversation_cap');
  assertEquals(blockedAlertKind({ allowed: true, used: 1, max: 10 }), null);
});

Deno.test('the cap window matches how each limit resets', () => {
  const now = new Date('2026-09-15T10:22:50Z');
  assertEquals(blockedAlertPeriodKey('trial_expired', trial, now), 'trial:2026-09-09T17:39:39.564Z');
  assertEquals(blockedAlertPeriodKey('grant_exhausted', grant, now), 'grant');
  assertEquals(blockedAlertPeriodKey('plan_limit', plan, now), 'month:2026-09');
  assertEquals(blockedAlertPeriodKey('conversation_cap', cap, now), 'day:2026-09-15');
});

// ── The cap of 3 ────────────────────────────────────────────────────────────

Deno.test('only the first 3 conversations alert the owner; the 4th costs one RPC and nothing else', async () => {
  const supabase = makeSupabase();
  const sent: Sent = [];
  for (const id of ['c1', 'c2', 'c3']) {
    assertEquals((await alert(supabase, trial, id, sent)).status, 'sent');
  }
  const lookupsBefore = supabase.lookups.length;
  const fourth = await alert(supabase, trial, 'c4', sent);

  assertEquals(MAX_BLOCKED_ALERTS_PER_PERIOD, 3);
  assertEquals(fourth.status, 'skipped');
  assertEquals(sent.length, 3);
  assertEquals(sent.map((s) => s.email.alertNumber), [1, 2, 3]);
  assertEquals(supabase.lookups.length, lookupsBefore, 'no client/recipient lookups once the cap is spent');
});

Deno.test('a second message in the same conversation does not email again', async () => {
  const supabase = makeSupabase();
  const sent: Sent = [];
  await alert(supabase, trial, 'c1', sent);
  const again = await alert(supabase, trial, 'c1', sent);
  assertEquals(again.status, 'skipped');
  assertEquals(sent.length, 1);
});

Deno.test('a failed send gives the slot back so a later message can still alert', async () => {
  const supabase = makeSupabase();
  const sent: Sent = [];
  const failed = await alert(supabase, trial, 'c1', sent, {
    send: () => Promise.resolve({ sent: false, reason: 'Resend 500' }),
  });
  assertEquals(failed.status, 'failed');
  assertEquals(supabase.ledger.length, 0, 'the claim must not outlive a failed send');

  const retry = await alert(supabase, trial, 'c1', sent);
  assertEquals(retry.status, 'sent');
  assertEquals(retry.alertNumber, 1);
});

Deno.test('no recipient releases the claim instead of burning a slot', async () => {
  const supabase = makeSupabase({ ownerEmail: null });
  const sent: Sent = [];
  const outcome = await alert(supabase, trial, 'c1', sent, { send: undefined });
  assertEquals(outcome.status, 'failed');
  assertEquals(outcome.reason, 'no recipient');
  assertEquals(supabase.ledger.length, 0);
});

Deno.test('a successful alert records where it went', async () => {
  const supabase = makeSupabase();
  await alert(supabase, grant, 'c1', []);
  assertEquals(supabase.updates.length, 1);
  assertEquals((supabase.updates[0].patch as { recipient: string }).recipient, 'owner@example.com');
});

Deno.test('never throws on the live reply path', async () => {
  const supabase = makeSupabase({ claimError: 'deadlock detected' });
  const outcome = await alert(supabase, trial, 'c1', []);
  assertEquals(outcome.status, 'failed');
});

// ── Who is told ─────────────────────────────────────────────────────────────

Deno.test('billing alerts go to the account owner even when the agent has an inbox contact', async () => {
  const supabase = makeSupabase({ handoffContact: 'inbox@example.com', ownerEmail: 'owner@example.com' });
  const sent: Sent = [];
  const realRecipient = await alertOwnerOfBlockedMessage({
    supabase,
    allowance: plan,
    clientId: 'client-1',
    conversationId: 'c1',
    botProfileId: 'bot-1',
    customerName: null,
    channelLabel: 'Instagram',
    lastMessage: null,
    send: (to, email) => {
      sent.push({ to, email });
      return Promise.resolve({ sent: true });
    },
  });
  assertEquals(realRecipient.status, 'sent');
  assertEquals(sent[0].to, 'owner@example.com');
});

Deno.test('the reply-cap alert goes to whoever handles the inbox', async () => {
  const supabase = makeSupabase({ handoffContact: 'inbox@example.com', ownerEmail: 'owner@example.com' });
  const sent: Sent = [];
  await alertOwnerOfBlockedMessage({
    supabase,
    allowance: cap,
    clientId: 'client-1',
    conversationId: 'c1',
    botProfileId: 'bot-1',
    customerName: '@someone',
    channelLabel: 'Facebook Messenger',
    lastMessage: 'still there?',
    send: (to, email) => {
      sent.push({ to, email });
      return Promise.resolve({ sent: true });
    },
  });
  assertEquals(sent[0].to, 'inbox@example.com');
  assertEquals(sent[0].email.replyLimit, 30);
});

// ── What is said ────────────────────────────────────────────────────────────

const kinds: BlockedAlertKind[] = ['trial_expired', 'grant_exhausted', 'plan_limit', 'conversation_cap'];

function email(kind: BlockedAlertKind, overrides: Partial<BlockedAlertEmail> = {}): BlockedAlertEmail {
  return {
    kind,
    businessName: 'In House Chef',
    customerName: '@mariamorazzani',
    channelLabel: 'Instagram',
    lastMessage: 'Hola. Aun sin recibir llamada',
    conversationId: '6ca99e98-7956-4383-ad63-ff668b0aaa07',
    replyLimit: kind === 'conversation_cap' ? 30 : null,
    alertNumber: 2,
    alertLimit: 3,
    ...overrides,
  };
}

Deno.test('every alert tells the owner the customer got nothing — and promises nothing itself', () => {
  for (const kind of kinds) {
    const { subject, html } = buildBlockedAlertEmail(email(kind));
    assertStringIncludes(subject, '@mariamorazzani');
    assertStringIncludes(html, 'have not been sent any reply');
    assertStringIncludes(html, 'Hola. Aun sin recibir llamada');
    assertStringIncludes(html, 'alert 2 of 3');
    assert(!/shortly/i.test(subject + html), `${kind} must never say "shortly"`);
  }
});

Deno.test('the four emails are genuinely different', () => {
  const subjects = new Set(kinds.map((k) => buildBlockedAlertEmail(email(k)).subject));
  assertEquals(subjects.size, 4);
  assertStringIncludes(buildBlockedAlertEmail(email('trial_expired')).html, 'free trial has ended');
  assertStringIncludes(buildBlockedAlertEmail(email('grant_exhausted')).html, 'all of your free messages');
  assertStringIncludes(buildBlockedAlertEmail(email('plan_limit')).html, 'new month starts');
  assertStringIncludes(buildBlockedAlertEmail(email('conversation_cap')).html, '30 replies');
});

Deno.test('billing alerts ask for a plan; the reply-cap alert only opens the conversation', () => {
  for (const kind of ['trial_expired', 'grant_exhausted', 'plan_limit'] as const) {
    assertStringIncludes(buildBlockedAlertEmail(email(kind)).html, 'settings?tab=billing');
  }
  const capHtml = buildBlockedAlertEmail(email('conversation_cap')).html;
  assert(!capHtml.includes('settings?tab=billing'), 'an active business must not be asked to pay');
  assertStringIncludes(capHtml, 'dashboard/inbox?conversation=6ca99e98-7956-4383-ad63-ff668b0aaa07');
});

Deno.test("the customer's own words are escaped", () => {
  const { html } = buildBlockedAlertEmail(email('trial_expired', {
    customerName: '<b>x</b>',
    lastMessage: '<script>alert(1)</script>',
  }));
  assert(!html.includes('<script>'));
  assertStringIncludes(html, '&lt;script&gt;');
});

Deno.test('a missing name or business still reads as a sentence', () => {
  const { subject, html } = buildBlockedAlertEmail(email('trial_expired', { customerName: null, businessName: null }));
  assertStringIncludes(subject, 'A customer');
  assertStringIncludes(html, 'your business');
});
