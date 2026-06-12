import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Zap, Crown, Rocket, Building2, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

interface UserSubscription {
  plan: 'free' | 'starter' | 'growth' | 'pro' | 'agency';
  status: 'active' | 'inactive' | 'past_due' | 'canceled' | 'trialing';
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

interface Plan {
  id: 'starter' | 'growth' | 'pro' | 'agency';
  name: string;
  icon: React.ElementType;
  price: { monthly: number; yearly: number };
  features: { text: string; included: boolean }[];
  highlight?: boolean;
}

const plans: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    icon: Zap,
    price: { monthly: 29, yearly: 290 },
    features: [
      { text: '1 connected channel', included: true },
      { text: '1 AI bot', included: true },
      { text: '500 conversations/mo', included: true },
      { text: 'Standard support', included: true },
      { text: 'Human handoff inbox', included: true },
      { text: 'White-label', included: false },
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    icon: Rocket,
    price: { monthly: 79, yearly: 790 },
    features: [
      { text: '3 connected channels', included: true },
      { text: '2 AI bots', included: true },
      { text: '2,500 conversations/mo', included: true },
      { text: 'Priority support', included: true },
      { text: 'Human handoff inbox', included: true },
      { text: 'White-label', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    icon: Crown,
    price: { monthly: 199, yearly: 1990 },
    features: [
      { text: '10 connected channels', included: true },
      { text: '3 AI bots', included: true },
      { text: '10,000 conversations/mo', included: true },
      { text: 'Priority support', included: true },
      { text: 'Lead capture & automations', included: true },
      { text: 'White-label', included: false },
    ],
    highlight: true,
  },
  {
    id: 'agency',
    name: 'Agency',
    icon: Building2,
    price: { monthly: 499, yearly: 4990 },
    features: [
      { text: 'Unlimited channels', included: true },
      { text: '10 AI bots', included: true },
      { text: 'Unlimited conversations', included: true },
      { text: 'Dedicated support', included: true },
      { text: 'Lead capture & automations', included: true },
      { text: 'White-label', included: true },
    ],
  },
];

async function callBillingProxy(
  accessToken: string,
  body: Record<string, unknown>,
): Promise<{ url?: string; error?: string }> {
  if (!SUPABASE_URL) throw new Error('VITE_SUPABASE_URL not configured');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-billing`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

export default function Subscription() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  const checkoutStatus = searchParams.get('checkout');

  useEffect(() => {
    async function loadSubscription() {
      if (!supabase) { setLoadingPlan(false); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingPlan(false); return; }

      const { data } = await supabase
        .from('subscriptions')
        .select('plan, status, current_period_end, cancel_at_period_end')
        .eq('user_id', user.id)
        .maybeSingle();

      setSubscription(data as UserSubscription | null);
      setLoadingPlan(false);
    }
    loadSubscription();
  }, []);

  const handleSubscribe = async (planId: string) => {
    if (!supabase) return;
    setError(null);
    setCheckoutLoading(planId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Session expired — please refresh.');

      const result = await callBillingProxy(session.access_token, {
        action: 'create_checkout',
        plan: planId,
        billingCycle,
      });

      if (result.error) throw new Error(result.error);
      if (result.url) window.location.href = result.url;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleManageBilling = async () => {
    if (!supabase) return;
    setError(null);
    setPortalLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Session expired — please refresh.');

      const result = await callBillingProxy(session.access_token, { action: 'create_portal' });
      if (result.error) throw new Error(result.error);
      if (result.url) window.location.href = result.url;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPortalLoading(false);
    }
  };

  const isActivePlan = (planId: string) =>
    subscription?.plan === planId &&
    (subscription.status === 'active' || subscription.status === 'trialing');

  const hasActivePaidPlan = subscription?.status === 'active' || subscription?.status === 'trialing';

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/20 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8 md:mb-12">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl md:text-4xl font-bold mb-3 md:mb-4"
          >
            Choose Your Plan
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-secondary-foreground text-sm md:text-lg"
          >
            Select the plan that best suits your needs
          </motion.p>
        </div>

        {/* Checkout status banners */}
        {checkoutStatus === 'success' && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 rounded-xl flex items-center gap-3">
            <Check className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="font-medium">Subscription activated!</p>
              <p className="text-sm">Your plan is now active. Welcome aboard.</p>
            </div>
          </div>
        )}
        {checkoutStatus === 'cancelled' && (
          <div className="mb-6 p-4 bg-secondary/50 border border-secondary rounded-xl text-sm text-secondary-foreground">
            Checkout was cancelled — your plan has not changed.
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 text-red-500 rounded-xl flex items-start gap-3 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Current plan banner */}
        {!loadingPlan && hasActivePaidPlan && (
          <div className="mb-6 p-4 bg-primary/10 border border-primary/30 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="font-medium capitalize">
                Current plan: {subscription?.plan}
                {subscription?.cancel_at_period_end && (
                  <span className="ml-2 text-sm font-normal text-secondary-foreground">
                    (cancels{' '}
                    {subscription.current_period_end
                      ? new Date(subscription.current_period_end).toLocaleDateString()
                      : 'at period end'}
                    )
                  </span>
                )}
              </p>
              {subscription?.current_period_end && !subscription.cancel_at_period_end && (
                <p className="text-sm text-secondary-foreground">
                  Renews {new Date(subscription.current_period_end).toLocaleDateString()}
                </p>
              )}
            </div>
            <button
              onClick={handleManageBilling}
              disabled={portalLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
            >
              {portalLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Manage Billing
            </button>
          </div>
        )}

        {/* Billing toggle */}
        <div className="flex justify-center mb-8 md:mb-12">
          <div className="bg-secondary/50 rounded-lg p-1 w-full max-w-sm md:w-auto">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={cn(
                'px-4 py-2.5 md:py-2 rounded-md transition-colors w-1/2 md:w-auto touch-manipulation text-sm md:text-base',
                billingCycle === 'monthly'
                  ? 'bg-primary text-white'
                  : 'text-secondary-foreground hover:bg-secondary'
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={cn(
                'px-4 py-2.5 md:py-2 rounded-md transition-colors w-1/2 md:w-auto touch-manipulation text-sm md:text-base',
                billingCycle === 'yearly'
                  ? 'bg-primary text-white'
                  : 'text-secondary-foreground hover:bg-secondary'
              )}
            >
              Yearly (2 months free)
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 md:gap-8">
          {plans.map((plan) => {
            const isCurrent = isActivePlan(plan.id);
            const isLoading = checkoutLoading === plan.id;

            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className={cn(
                  'relative rounded-2xl p-5 md:p-6',
                  plan.highlight
                    ? 'bg-primary/10 border-2 border-primary'
                    : 'bg-secondary/50',
                  isCurrent && 'ring-2 ring-green-500',
                )}
              >
                {plan.highlight && !isCurrent && (
                  <div className="absolute -top-3 md:-top-4 left-1/2 -translate-x-1/2 bg-primary text-white px-3 md:px-4 py-1 rounded-full text-xs md:text-sm">
                    Most Popular
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute -top-3 md:-top-4 left-1/2 -translate-x-1/2 bg-green-500 text-white px-3 md:px-4 py-1 rounded-full text-xs md:text-sm">
                    Current Plan
                  </div>
                )}

                <div className="flex items-center gap-2 md:gap-3 mb-5 md:mb-6">
                  <div className={cn(
                    'p-1.5 md:p-2 rounded-lg',
                    plan.highlight ? 'bg-primary text-white' : 'bg-secondary'
                  )}>
                    <plan.icon className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <h3 className="text-lg md:text-xl font-semibold">{plan.name}</h3>
                </div>

                <div className="mb-5 md:mb-6">
                  <div className="flex items-baseline">
                    <span className="text-2xl md:text-3xl font-bold">
                      ${billingCycle === 'monthly' ? plan.price.monthly : plan.price.yearly}
                    </span>
                    <span className="text-secondary-foreground ml-2 text-sm md:text-base">
                      /{billingCycle === 'monthly' ? 'mo' : 'yr'}
                    </span>
                  </div>
                  {billingCycle === 'yearly' && (
                    <p className="text-xs md:text-sm text-primary mt-1">
                      ${Math.round(plan.price.yearly / 12)}/mo — save $
                      {plan.price.monthly * 12 - plan.price.yearly} vs monthly
                    </p>
                  )}
                </div>

                <ul className="space-y-3 md:space-y-4 mb-6 md:mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2 md:gap-3">
                      <div className={cn(
                        'rounded-full p-1 flex-shrink-0 mt-0.5',
                        feature.included ? 'text-green-500' : 'text-secondary-foreground'
                      )}>
                        <Check className="w-3 h-3 md:w-4 md:h-4" />
                      </div>
                      <span className={cn(
                        'text-xs md:text-sm',
                        !feature.included && 'text-secondary-foreground'
                      )}>
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => isCurrent ? handleManageBilling() : handleSubscribe(plan.id)}
                  disabled={isLoading || portalLoading || loadingPlan}
                  className={cn(
                    'w-full py-2.5 md:py-2 rounded-lg transition-colors touch-manipulation text-sm md:text-base flex items-center justify-center gap-2',
                    plan.highlight
                      ? 'bg-primary hover:bg-primary/90 active:bg-primary/80 text-white'
                      : 'bg-secondary hover:bg-secondary/70 active:bg-secondary/60',
                    (isLoading || portalLoading || loadingPlan) && 'opacity-60 cursor-not-allowed',
                  )}
                >
                  {isLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting…</>
                  ) : isCurrent ? (
                    'Manage Plan'
                  ) : (
                    'Get Started'
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-8 md:mt-12 text-center text-secondary-foreground text-xs md:text-base px-4">
          <p>All plans include 24/7 support and a 14-day money-back guarantee.</p>
          <p className="mt-2">
            Need a custom plan?{' '}
            <a href="mailto:wolfpackmediapr@gmail.com" className="text-primary hover:underline touch-manipulation">
              Contact us
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
