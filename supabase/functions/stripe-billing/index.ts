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

function getStripe() {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return new Stripe(key, { apiVersion: '2024-04-10' });
}

// Map plan + cycle → Stripe Price ID (set these as Supabase edge function secrets)
function getPriceId(plan: string, billingCycle: string): string | null {
  const map: Record<string, string | undefined> = {
    'starter_monthly': Deno.env.get('STRIPE_PRICE_STARTER_MONTHLY'),
    'starter_yearly':  Deno.env.get('STRIPE_PRICE_STARTER_YEARLY'),
    'growth_monthly':  Deno.env.get('STRIPE_PRICE_GROWTH_MONTHLY'),
    'growth_yearly':   Deno.env.get('STRIPE_PRICE_GROWTH_YEARLY'),
    'pro_monthly':     Deno.env.get('STRIPE_PRICE_PRO_MONTHLY'),
    'pro_yearly':      Deno.env.get('STRIPE_PRICE_PRO_YEARLY'),
    'agency_monthly':  Deno.env.get('STRIPE_PRICE_AGENCY_MONTHLY'),
    'agency_yearly':   Deno.env.get('STRIPE_PRICE_AGENCY_YEARLY'),
  };
  return map[`${plan}_${billingCycle}`] ?? null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const jwt = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return jsonResponse({ error: 'No authorization token' }, 401);

  const supabase = getSupabaseAdmin();
  const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !user) return jsonResponse({ error: 'Invalid token' }, 401);

  let body: { action?: string; plan?: string; billingCycle?: string };
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { action, plan, billingCycle } = body;
  const siteUrl = Deno.env.get('SITE_URL') ?? 'https://your-app.vercel.app';

  let stripe: Stripe;
  try { stripe = getStripe(); } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }

  // ── Get or create Stripe customer ─────────────────────────────────────────
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  let customerId = (sub as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;

    // Upsert (UNIQUE on user_id): if the signup trigger never created this
    // user's row, an UPDATE would match 0 rows and every checkout attempt
    // would mint a new orphaned Stripe customer.
    const { error: saveError } = await supabase
      .from('subscriptions')
      .upsert(
        { user_id: user.id, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    if (saveError) {
      console.error('[stripe-billing] Failed to save stripe_customer_id:', saveError.message);
    }
  }

  // ── create_checkout ────────────────────────────────────────────────────────
  if (action === 'create_checkout') {
    if (!plan || !billingCycle) {
      return jsonResponse({ error: 'plan and billingCycle are required' }, 400);
    }

    const priceId = getPriceId(plan, billingCycle);
    if (!priceId) {
      return jsonResponse({
        error: `No Stripe price configured for ${plan}/${billingCycle}. ` +
          'Set STRIPE_PRICE_* secrets in your Supabase dashboard.',
      }, 422);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${siteUrl}/dashboard/subscription?checkout=success`,
      cancel_url: `${siteUrl}/dashboard/subscription?checkout=cancelled`,
      metadata: { supabase_user_id: user.id, plan, billing_cycle: billingCycle },
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan, billing_cycle: billingCycle },
      },
    });

    return jsonResponse({ url: session.url });
  }

  // ── create_portal ──────────────────────────────────────────────────────────
  if (action === 'create_portal') {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/dashboard/subscription`,
    });
    return jsonResponse({ url: session.url });
  }

  return jsonResponse({ error: `Unknown action: ${action ?? '(none)'}` }, 400);
});
