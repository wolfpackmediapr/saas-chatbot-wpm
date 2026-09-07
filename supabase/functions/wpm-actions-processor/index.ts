import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { processPendingWebhookToolExecutions } from '../_shared/wpm_actions.ts';
import { sendDueTrialNotifications } from '../_shared/wpm_trial_notifications.ts';
import { sendTrialExpiredEmail, sendTrialExpiringSoonEmail } from '../_shared/wpm_email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-wpm-action-secret, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function getSupabaseAdmin() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false as const, error: 'Missing Supabase service configuration.' };
  }

  return {
    ok: true as const,
    supabase: createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }),
  };
}

function isAuthorized(req: Request): boolean {
  const expectedSecret = Deno.env.get('WPM_ACTION_PROCESSOR_SECRET');
  if (!expectedSecret) return false;

  const providedSecret = req.headers.get('x-wpm-action-secret') ?? '';
  return providedSecret === expectedSecret;
}

interface RequestBody {
  batchSize: number;
  /**
   * Which jobs to run. Absent means webhooks only, which is exactly what the
   * existing every-2-minutes `drain-lead-webhooks` cron sends — this function
   * gained a second job in 2026-09 and the old caller must keep behaving
   * identically without being edited.
   */
  tasks: Array<'webhooks' | 'trial_notifications'>;
  /**
   * Preview address. Sends BOTH trial templates to one address and touches
   * nothing else: no ledger row is claimed, nothing is recorded, and no real
   * customer is mailed. It exists because the people who need to approve this
   * copy are on admin or agency plans and so are never selected by the real
   * sweep — the alternative was editing a super admin's subscription row to
   * 'free', which would cap them at 2 channels / 1 bot.
   */
  previewTo: string | null;
}

async function readBody(req: Request): Promise<RequestBody> {
  try {
    const body = await req.json();
    const rawBatchSize = typeof body?.batchSize === 'number' ? body.batchSize : Number(body?.batchSize ?? 10);
    const rawTasks = Array.isArray(body?.tasks) ? body.tasks : null;
    const previewTo = typeof body?.previewTo === 'string' && body.previewTo.includes('@')
      ? body.previewTo.trim()
      : null;
    return {
      batchSize: Number.isFinite(rawBatchSize) ? rawBatchSize : 10,
      tasks: (rawTasks ?? ['webhooks']).filter(
        (t: unknown): t is 'webhooks' | 'trial_notifications' =>
          t === 'webhooks' || t === 'trial_notifications',
      ),
      previewTo,
    };
  } catch {
    return { batchSize: 10, tasks: ['webhooks'], previewTo: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);
  }

  if (!isAuthorized(req)) {
    return jsonResponse({ ok: false, error: 'Unauthorized.' }, 401);
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    return jsonResponse({ ok: false, error: admin.error }, 500);
  }

  const body = await readBody(req);

  // Preview short-circuits everything. It sends the two templates and returns;
  // it must never claim a notice or drain a queue.
  if (body.previewTo) {
    const soon = await sendTrialExpiringSoonEmail(body.previewTo, {
      businessName: 'Your Business',
      endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const expired = await sendTrialExpiredEmail(body.previewTo, { businessName: 'Your Business' });
    return jsonResponse({
      ok: soon.sent && expired.sent,
      preview: true,
      to: body.previewTo,
      expiringSoon: soon,
      expired,
    }, soon.sent && expired.sent ? 200 : 207);
  }

  const response: Record<string, unknown> = { ok: true };

  if (body.tasks.includes('webhooks')) {
    const result = await processPendingWebhookToolExecutions({
      supabase: admin.supabase,
      batchSize: body.batchSize,
      getEnv: (name) => Deno.env.get(name),
    });
    Object.assign(response, {
      ...result,
      results: result.results.map((row) => ({
        id: row.id,
        ok: row.ok,
        status: row.status,
        httpStatus: row.httpStatus,
        error: row.error,
      })),
    });
    if (!result.ok) response.ok = false;
  }

  if (body.tasks.includes('trial_notifications')) {
    const trial = await sendDueTrialNotifications({
      supabase: admin.supabase,
      sendExpiringSoon: sendTrialExpiringSoonEmail,
      sendExpired: sendTrialExpiredEmail,
    });
    response.trialNotifications = trial;
    if (!trial.ok) response.ok = false;
  }

  return jsonResponse(response, response.ok ? 200 : 207);
});
