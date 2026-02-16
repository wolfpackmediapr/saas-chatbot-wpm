import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Zap, Crown, Rocket } from 'lucide-react';
import { cn } from '../lib/utils';

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  name: string;
  icon: React.ElementType;
  price: {
    monthly: number;
    yearly: number;
  };
  features: PlanFeature[];
  highlight?: boolean;
}

const plans: Plan[] = [
  {
    name: 'Basic',
    icon: Zap,
    price: {
      monthly: 100,
      yearly: 1000,
    },
    features: [
      { text: '100 Messages per day', included: true },
      { text: 'Basic AI responses', included: true },
      { text: 'Chat history (7 days)', included: true },
      { text: 'Standard support', included: true },
      { text: 'Image generation', included: false },
      { text: 'Voice commands', included: false },
    ],
  },
  {
    name: 'Professional',
    icon: Crown,
    price: {
      monthly: 200,
      yearly: 2000,
    },
    features: [
      { text: 'Unlimited messages', included: true },
      { text: 'Advanced AI responses', included: true },
      { text: 'Unlimited chat history', included: true },
      { text: 'Priority support', included: true },
      { text: '100 Image generations/mo', included: true },
      { text: 'Voice commands', included: true },
    ],
    highlight: true,
  },
  {
    name: 'Enterprise',
    icon: Rocket,
    price: {
      monthly: 500,
      yearly: 5000,
    },
    features: [
      { text: 'Everything in Professional', included: true },
      { text: 'Custom AI training', included: true },
      { text: 'API access', included: true },
      { text: 'Dedicated support', included: true },
      { text: 'Unlimited image generation', included: true },
      { text: 'Custom integrations', included: true },
    ],
  },
];

export default function Subscription() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/20 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
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
              Yearly (Save 15%)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {plans.map((plan) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className={cn(
                'relative rounded-2xl p-5 md:p-6',
                plan.highlight
                  ? 'bg-primary/10 border-2 border-primary'
                  : 'bg-secondary/50'
              )}
            >
              {plan.highlight && (
                <div className="absolute -top-3 md:-top-4 left-1/2 -translate-x-1/2 bg-primary text-white px-3 md:px-4 py-1 rounded-full text-xs md:text-sm">
                  Most Popular
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
                  <p className="text-xs md:text-sm text-primary mt-1">Save ${plan.price.monthly * 12 - plan.price.yearly}</p>
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
                className={cn(
                  'w-full py-2.5 md:py-2 rounded-lg transition-colors touch-manipulation text-sm md:text-base',
                  plan.highlight
                    ? 'bg-primary hover:bg-primary-hover active:bg-primary-hover text-white'
                    : 'bg-secondary hover:bg-secondary/70 active:bg-secondary/60'
                )}
              >
                Get Started
              </button>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 md:mt-12 text-center text-secondary-foreground text-xs md:text-base px-4">
          <p>All plans include 24/7 support and a 14-day money-back guarantee.</p>
          <p className="mt-2">Need a custom plan? <a href="#" className="text-primary hover:underline touch-manipulation">Contact us</a></p>
        </div>
      </div>
    </div>
  );
}