import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { type DueTrialNotification, sendDueTrialNotifications } from './wpm_trial_notifications.ts';

/**
 * Stub shaped like the three calls the module makes: the rpc that lists what is
 * due, the claiming upsert, and the delete that releases a claim after a failed
 * send. `claimed` records every row the ledger currently holds so a test can
 * assert what survived.
 */
function makeSupabase(opts: {
  due?: DueTrialNotification[];
  rpcError?: string;
  claimError?: string;
  /** Rows already in the ledger — a claim on one of these returns nothing. */
  existing?: Array<{ user_id: string; kind: string; trial_ends_at: string }>;
}) {
  const claimed: Array<Record<string, unknown>> = [];
  const deleted: Array<Record<string, unknown>> = [];
  const existing = opts.existing ?? [];

  return {
    claimed,
    deleted,
    rpc(_fn: string) {
      if (opts.rpcError) return Promise.resolve({ data: null, error: { message: opts.rpcError } });
      return Promise.resolve({ data: opts.due ?? [], error: null });
    },
    from(_table: string) {
      const filters: Record<string, unknown> = {};
      return {
        upsert(row: Record<string, unknown>, _o: unknown) {
          return {
            select(_cols: string) {
              if (opts.claimError) {
                return Promise.resolve({ data: null, error: { message: opts.claimError } });
              }
              const taken = existing.some((e) =>
                e.user_id === row.user_id && e.kind === row.kind && e.trial_ends_at === row.trial_ends_at
              );
              if (taken) return Promise.resolve({ data: [], error: null });
              existing.push(row as { user_id: string; kind: string; trial_ends_at: string });
              claimed.push(row);
              return Promise.resolve({ data: [{ id: 'new' }], error: null });
            },
          };
        },
        delete() {
          const chain = {
            eq(column: string, value: unknown) {
              filters[column] = value;
              return chain;
            },
            then(resolve: (v: unknown) => void) {
              deleted.push({ ...filters });
              const i = existing.findIndex((e) =>
                e.user_id === filters.user_id && e.kind === filters.kind
              );
              if (i >= 0) existing.splice(i, 1);
              resolve({ error: null });
              return Promise.resolve({ error: null });
            },
          };
          return chain;
        },
      };
    },
  };
}

const soonRow: DueTrialNotification = {
  user_id: 'user-1',
  email: 'owner@example.test',
  kind: 'expiring_soon',
  trial_ends_at: '2026-09-09T17:39:39.000Z',
  business_name: 'In House Chef',
  messages_used: 31,
  messages_limit: 1000,
};

const expiredRow: DueTrialNotification = { ...soonRow, kind: 'expired' };

function sender(outcome: { sent: boolean; reason?: string }, seen: unknown[] = []) {
  return (to: string, args: { businessName?: string | null; endsAt: Date }) => {
    seen.push({ to, ...args });
    return Promise.resolve(outcome);
  };
}

Deno.test('sends the expiring-soon notice and records it', async () => {
  const seen: unknown[] = [];
  const supabase = makeSupabase({ due: [soonRow] });
  const result = await sendDueTrialNotifications({
    supabase,
    sendExpiringSoon: sender({ sent: true }, seen),
    sendExpired: sender({ sent: false, reason: 'wrong template' }),
    sendGrantLow: sender({ sent: false, reason: 'wrong template' }),
    sendGrantExhausted: sender({ sent: false, reason: 'wrong template' }),
  });

  assertEquals(result.sent, 1);
  assertEquals(result.failed, 0);
  assertEquals(supabase.claimed.length, 1);
  assertEquals((seen[0] as { to: string }).to, 'owner@example.test');
  assertEquals((seen[0] as { businessName: string }).businessName, 'In House Chef');
});

Deno.test('routes an expired trial to the expired template', async () => {
  const seen: unknown[] = [];
  const supabase = makeSupabase({ due: [expiredRow] });
  const result = await sendDueTrialNotifications({
    supabase,
    sendExpiringSoon: sender({ sent: false, reason: 'wrong template' }),
    sendExpired: sender({ sent: true }, seen),
    sendGrantLow: sender({ sent: false, reason: 'wrong template' }),
    sendGrantExhausted: sender({ sent: false, reason: 'wrong template' }),
  });

  assertEquals(result.sent, 1);
  assertEquals(seen.length, 1);
});

Deno.test('claims BEFORE sending, so a crash cannot re-send forever', async () => {
  // The claim must already be in the ledger by the time the sender runs.
  const supabase = makeSupabase({ due: [soonRow] });
  let ledgerAtSendTime = -1;
  await sendDueTrialNotifications({
    supabase,
    sendExpiringSoon: () => {
      ledgerAtSendTime = supabase.claimed.length;
      return Promise.resolve({ sent: true });
    },
    sendExpired: sender({ sent: false }),
    sendGrantLow: sender({ sent: false }),
    sendGrantExhausted: sender({ sent: false }),
  });
  assertEquals(ledgerAtSendTime, 1, 'the notice must be recorded before the email goes out');
});

Deno.test('a notice already in the ledger is skipped, not re-sent', async () => {
  const seen: unknown[] = [];
  const supabase = makeSupabase({
    due: [soonRow],
    existing: [{ user_id: 'user-1', kind: 'expiring_soon', trial_ends_at: soonRow.trial_ends_at }],
  });
  const result = await sendDueTrialNotifications({
    supabase,
    sendExpiringSoon: sender({ sent: true }, seen),
    sendExpired: sender({ sent: true }),
    sendGrantLow: sender({ sent: true }),
    sendGrantExhausted: sender({ sent: true }),
  });

  assertEquals(result.skipped, 1);
  assertEquals(result.sent, 0);
  assertEquals(seen.length, 0, 'no email may be sent for an already-claimed notice');
});

Deno.test('a failed send RELEASES the claim so the next sweep retries', async () => {
  const supabase = makeSupabase({ due: [soonRow] });
  const result = await sendDueTrialNotifications({
    supabase,
    sendExpiringSoon: sender({ sent: false, reason: 'Resend 429' }),
    sendExpired: sender({ sent: true }),
    sendGrantLow: sender({ sent: true }),
    sendGrantExhausted: sender({ sent: true }),
  });

  assertEquals(result.failed, 1);
  assertEquals(result.sent, 0);
  assertEquals(supabase.deleted.length, 1, 'the claim must not outlive a failed send');
  assertEquals((supabase.deleted[0] as { user_id: string }).user_id, 'user-1');
  assertEquals(result.results[0].reason, 'Resend 429');
});

Deno.test('a due-lookup failure is reported, not thrown', async () => {
  const supabase = makeSupabase({ rpcError: 'permission denied' });
  const result = await sendDueTrialNotifications({
    supabase,
    sendExpiringSoon: sender({ sent: true }),
    sendExpired: sender({ sent: true }),
    sendGrantLow: sender({ sent: true }),
    sendGrantExhausted: sender({ sent: true }),
  });

  assertEquals(result.ok, false);
  assertEquals(result.sent, 0);
  assertStringIncludes(result.error ?? '', 'permission denied');
});

Deno.test('a claim failure does not send the email', async () => {
  const seen: unknown[] = [];
  const supabase = makeSupabase({ due: [soonRow], claimError: 'deadlock detected' });
  const result = await sendDueTrialNotifications({
    supabase,
    sendExpiringSoon: sender({ sent: true }, seen),
    sendExpired: sender({ sent: true }),
    sendGrantLow: sender({ sent: true }),
    sendGrantExhausted: sender({ sent: true }),
  });

  assertEquals(result.failed, 1);
  assertEquals(seen.length, 0, 'an unclaimed notice must never be emailed');
});

// ── The grant half ──────────────────────────────────────────────────────────

const grantLowRow: DueTrialNotification = {
  ...soonRow,
  kind: 'grant_low',
  messages_used: 900,
  messages_limit: 1000,
};

const grantExhaustedRow: DueTrialNotification = {
  ...soonRow,
  kind: 'grant_exhausted',
  messages_used: 1000,
  messages_limit: 1000,
};

Deno.test('routes each kind to its own template, and passes the message counts', async () => {
  for (
    const [row, key] of [
      [grantLowRow, 'grantLow'],
      [grantExhaustedRow, 'grantExhausted'],
    ] as const
  ) {
    const seen: unknown[] = [];
    const wrong = sender({ sent: false, reason: 'wrong template' });
    const supabase = makeSupabase({ due: [row] });
    const result = await sendDueTrialNotifications({
      supabase,
      sendExpiringSoon: wrong,
      sendExpired: wrong,
      sendGrantLow: key === 'grantLow' ? sender({ sent: true }, seen) : wrong,
      sendGrantExhausted: key === 'grantExhausted' ? sender({ sent: true }, seen) : wrong,
    });

    assertEquals(result.sent, 1, `${row.kind} must reach its own template`);
    assertEquals(seen.length, 1);
    // The grant templates print these numbers; a wrong or missing count is the
    // one way they can ship looking fine and read as nonsense.
    assertEquals((seen[0] as { messagesUsed: number }).messagesUsed, row.messages_used);
    assertEquals((seen[0] as { messagesLimit: number }).messagesLimit, row.messages_limit);
  }
});

Deno.test('an unknown kind releases its claim instead of silently burning it', async () => {
  // If the SQL grows a fifth notice before this code knows about it, the claim
  // must come back so the notice is still due once the deploy catches up.
  const supabase = makeSupabase({
    due: [{ ...soonRow, kind: 'some_future_kind' as DueTrialNotification['kind'] }],
  });
  const never = sender({ sent: true });
  const result = await sendDueTrialNotifications({
    supabase,
    sendExpiringSoon: never,
    sendExpired: never,
    sendGrantLow: never,
    sendGrantExhausted: never,
  });

  assertEquals(result.failed, 1);
  assertEquals(result.sent, 0);
  assertEquals(supabase.deleted.length, 1, 'the claim must be released, not kept');
  assertEquals(result.results[0].reason, 'unknown kind');
});
