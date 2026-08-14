/**
 * Account deletion — the executable half of the promise published at
 * https://wolfpackmediapr.com/data-deletion.
 *
 * Order matters, and it is the whole reason this is an edge function rather
 * than just the SQL routine:
 *
 *   1. Cancel the Stripe subscription. If the auth user is removed first and
 *      this step then fails, the customer keeps getting charged for an account
 *      that no longer exists and can no longer sign in to cancel it.
 *   2. Delete every row via delete_my_account() (webhook events first — their
 *      FKs are SET NULL, not CASCADE, so a plain client delete would strand
 *      raw_payload rows containing customer message text).
 *   3. Delete the auth identity last. Once it is gone the caller's JWT is
 *      useless, so nothing after this point could be retried.
 *
 * The caller proves identity with their own JWT and can only ever delete
 * themselves — there is no user id in the request body to tamper with.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Cancel any live Stripe subscription for this user. Returns a note for the
 * response rather than throwing: a billing problem must not leave the account
 * half-deleted, and Stripe state is recoverable by hand where data is not.
 */
async function cancelStripeSubscription(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
): Promise<{ cancelled: string[]; note?: string }> {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) return { cancelled: [], note: 'STRIPE_SECRET_KEY not configured; no billing action taken' };

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  const customerId = (sub as { stripe_customer_id?: string | null } | null)?.stripe_customer_id;
  if (!customerId) return { cancelled: [] };

  try {
    const stripe = new Stripe(key, { apiVersion: '2024-04-10' });
    const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
    const cancelled: string[] = [];

    for (const s of subs.data) {
      // 'canceled' is already terminal; 'incomplete_expired' never activated.
      if (s.status === 'canceled' || s.status === 'incomplete_expired') continue;
      // Immediate, not at period end — the account is being erased now, so
      // there is nobody left to serve for the remainder of the period.
      await stripe.subscriptions.cancel(s.id);
      cancelled.push(s.id);
    }
    return { cancelled };
  } catch (e) {
    console.error('[delete-account] Stripe cancellation failed:', e);
    return { cancelled: [], note: `Stripe cancellation failed: ${String(e)}` };
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const jwt = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return jsonResponse({ error: 'No authorization token' }, 401);

  const supabase = getSupabaseAdmin();
  const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !user) return jsonResponse({ error: 'Invalid token' }, 401);

  // Typed confirmation, checked server-side too. The UI asks for it, but a
  // deletion this final should not be reachable by a stray fetch either.
  let body: { confirmEmail?: string };
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const confirm = (body.confirmEmail ?? '').trim().toLowerCase();
  if (!confirm || confirm !== (user.email ?? '').toLowerCase()) {
    return jsonResponse(
      { error: 'confirmEmail must match the email address on the account' },
      400,
    );
  }

  // ── 1. Billing first ───────────────────────────────────────────────────────
  const billing = await cancelStripeSubscription(supabase, user.id);

  // ── 2. Application data ────────────────────────────────────────────────────
  // Runs as the caller so delete_my_account()'s auth.uid() resolves to them and
  // its own super-admin guard applies.
  const asUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    },
  );

  const { data: deletion, error: deleteError } = await asUser.rpc('delete_my_account');
  if (deleteError) {
    console.error('[delete-account] Data deletion failed:', deleteError.message);
    return jsonResponse(
      {
        error: 'Failed to delete account data. Nothing was removed; please contact support.',
        detail: deleteError.message,
        billing,
      },
      500,
    );
  }

  // ── 3. Identity last ───────────────────────────────────────────────────────
  const { error: authError } = await supabase.auth.admin.deleteUser(user.id);
  if (authError) {
    // Data is gone but the login remains. Report it loudly: the account is
    // empty and unusable, and the identity needs removing by hand.
    console.error('[delete-account] Auth user deletion failed:', authError.message);
    return jsonResponse(
      {
        error: 'Account data was deleted, but the login could not be removed. Contact support.',
        detail: authError.message,
        deletion,
        billing,
      },
      500,
    );
  }

  console.log(`[delete-account] Deleted account ${user.id}`);
  return jsonResponse({ ok: true, deletion, billing });
});
