import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function stripePlanFromMetadata(metadata: Stripe.Metadata | null): string {
  const plan = metadata?.plan;
  if (plan === 'starter' || plan === 'growth' || plan === 'pro' || plan === 'agency') return plan;
  return 'free';
}

function stripeStatusToInternal(status: Stripe.Subscription.Status): string {
  if (status === 'active') return 'active';
  if (status === 'trialing') return 'trialing';
  if (status === 'past_due') return 'past_due';
  if (status === 'canceled' || status === 'incomplete_expired') return 'canceled';
  return 'inactive';
}

async function upsertSubscription(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  stripeSub: Stripe.Subscription,
): Promise<{ ok: boolean; detail: string }> {
  const userId = stripeSub.metadata?.supabase_user_id;
  if (!userId) {
    console.warn('[stripe-webhook] subscription missing supabase_user_id metadata', stripeSub.id);
    return { ok: false, detail: 'missing supabase_user_id metadata' };
  }

  const plan = stripePlanFromMetadata(stripeSub.metadata);
  const status = stripeStatusToInternal(stripeSub.status);
  const currentPeriodEnd = new Date(stripeSub.current_period_end * 1000).toISOString();

  const { data, error } = await supabase
    .from('subscriptions')
    .update({
      stripe_subscription_id: stripeSub.id,
      stripe_customer_id: typeof stripeSub.customer === 'string'
        ? stripeSub.customer
        : stripeSub.customer.id,
      plan,
      status,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: stripeSub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select('user_id');

  if (error) {
    console.error('[stripe-webhook] upsertSubscription error', error.message);
    return { ok: false, detail: error.message };
  }
  console.log(`[stripe-webhook] subscription updated for user ${userId}: ${plan} / ${status} (${data?.length ?? 0} rows)`);
  return { ok: true, detail: `updated ${data?.length ?? 0} rows for ${userId} -> ${plan}/${status}` };
}

async function handleCheckoutCompleted(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  if (!session.subscription) return;

  const userId = session.metadata?.supabase_user_id;
  if (!userId) return;

  // Stripe Checkout doesn't copy metadata to the subscription automatically —
  // patch it here so future subscription events carry the user ID.
  const subId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription.id;

  await stripe.subscriptions.update(subId, {
    metadata: {
      supabase_user_id: userId,
      plan: session.metadata?.plan ?? 'starter',
      billing_cycle: session.metadata?.billing_cycle ?? 'monthly',
    },
  });

  const stripeSub = await stripe.subscriptions.retrieve(subId);
  await upsertSubscription(supabase, stripeSub);
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');

  if (!stripeKey) {
    return new Response('STRIPE_SECRET_KEY not configured', { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' });

  // Read raw body for signature verification
  const rawBody = await request.text();
  const sig = request.headers.get('stripe-signature');

  let event: Stripe.Event;
  try {
    if (webhookSecret && sig) {
      event = await stripe.webhooks.constructEventAsync(rawBody, sig, webhookSecret);
    } else {
      // Dev fallback — skip signature verification if secret not set
      console.warn('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set — skipping signature check');
      event = JSON.parse(rawBody) as Stripe.Event;
    }
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', (err as Error).message);
    return new Response(`Webhook error: ${(err as Error).message}`, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(supabase, stripe, event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const result = await upsertSubscription(supabase, event.data.object as Stripe.Subscription);
        return new Response(JSON.stringify({ received: true, ...result }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        if (userId) {
          await supabase
            .from('subscriptions')
            .update({
              plan: 'free',
              status: 'inactive',
              stripe_subscription_id: null,
              cancel_at_period_end: false,
              current_period_end: null,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId);
          console.log(`[stripe-webhook] subscription cancelled for user ${userId}`);
        }
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('[stripe-webhook] Handler error:', (err as Error).message);
    return new Response(`Handler error: ${(err as Error).message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
