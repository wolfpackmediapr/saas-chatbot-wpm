import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, CheckCircle2, ArrowRight } from 'lucide-react';

type BillingPeriod = 'monthly' | 'yearly';

interface Tier {
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  popular?: boolean;
  description: string;
  messages: string;
  model: string;
  features: string[];
  cta: string;
  ctaLink: string;
  overage: string;
}

const tiers: Tier[] = [
  {
    name: "Starter",
    monthlyPrice: 29,
    yearlyPrice: 290,
    description: "Perfect for small businesses getting started with AI-powered DMs.",
    messages: "1 channel • 500 conversations/mo",
    model: "GPT-4o-mini",
    features: [
      "1 connected channel (WhatsApp, Instagram or Facebook)",
      "1 AI bot with your brand voice & knowledge",
      "500 conversations per month",
      "Human handoff inbox included",
      "Basic automations & email support",
      "Launch Checklist & Test Agent",
      "7-day free trial"
    ],
    cta: "Start 7-day free trial",
    ctaLink: "/signup",
    overage: "Fair overages apply after limit"
  },
  {
    name: "Growth",
    monthlyPrice: 79,
    yearlyPrice: 790,
    description: "For growing businesses handling real DM volume.",
    messages: "3 channels • 2,500 conversations/mo",
    model: "Full GPT-4o",
    features: [
      "3 connected channels",
      "2 AI bots",
      "2,500 conversations per month",
      "Human handoff inbox",
      "Priority support",
      "Full automations (Zapier, webhooks, Resend)",
      "Advanced lead capture",
      "Unlimited history & Test Agent"
    ],
    cta: "Start 7-day free trial",
    ctaLink: "/signup",
    overage: "Fair overages apply after limit"
  },
  {
    name: "Pro",
    monthlyPrice: 199,
    yearlyPrice: 1990,
    popular: true,
    description: "The sweet spot for serious operators. Most popular plan.",
    messages: "10 channels • 10,000 conversations/mo",
    model: "Full GPT-4o + priority",
    features: [
      "10 connected channels",
      "3 AI bots",
      "10,000 conversations per month",
      "Human handoff inbox",
      "Priority support (same-day)",
      "Lead capture & full automations",
      "White-label ready",
      "Unlimited history & Launch Checklist"
    ],
    cta: "Start 7-day free trial",
    ctaLink: "/signup",
    overage: "Fair overages apply after limit"
  },
  {
    name: "Agency",
    monthlyPrice: 499,
    yearlyPrice: 4990,
    description: "For agencies and high-volume businesses with multiple brands.",
    messages: "Unlimited channels & conversations",
    model: "GPT-4o + dedicated priority",
    features: [
      "Unlimited connected channels",
      "10 AI bots",
      "Unlimited conversations",
      "Dedicated support & onboarding",
      "Lead capture & automations",
      "Full white-label",
      "API access & custom integrations",
      "Multi-brand / multi-location ready"
    ],
    cta: "Contact sales",
    ctaLink: "/signup",
    overage: "Volume pricing available"
  }
];

export default function Pricing() {
  const [period, setPeriod] = useState<BillingPeriod>('monthly');

  const getPrice = (tier: Tier) => {
    return period === 'monthly' ? tier.monthlyPrice : tier.yearlyPrice;
  };

  const getSavings = (tier: Tier) => {
    if (period === 'monthly') return null;
    const monthlyTotal = tier.monthlyPrice * 12;
    const savings = Math.round( ((monthlyTotal - tier.yearlyPrice) / monthlyTotal ) * 100 );
    return savings;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Public Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-b border-secondary">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-xl">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="font-semibold text-lg">WolfPack AI</div>
              <div className="text-[10px] text-secondary-foreground -mt-1">DM Agent</div>
            </div>
          </Link>

          <div className="flex items-center gap-4 text-sm">
            <Link to="/" className="text-secondary-foreground hover:text-foreground transition-colors px-3 py-1.5">
              Home
            </Link>
            <Link 
              to="/login" 
              className="px-4 py-1.5 rounded-lg hover:bg-secondary text-secondary-foreground hover:text-foreground transition-colors"
            >
              Log in
            </Link>
            <Link 
              to="/signup" 
              className="px-5 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              Start 7-day free trial
            </Link>
          </div>
        </div>
      </nav>

      <div className="pt-20 pb-12 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-secondary/60 border border-secondary text-xs tracking-[1px] mb-4">
            TRANSPARENT & FAIR
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tighter mb-4">Pricing that scales with you</h1>
          <p className="text-xl text-secondary-foreground max-w-lg mx-auto">
            Real costs. Real margins. No hidden fees. Choose the plan that matches your DM volume.
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center mt-10 mb-12">
          <div className="inline-flex bg-secondary/70 border border-secondary rounded-2xl p-1">
            <button
              onClick={() => setPeriod('monthly')}
              className={`px-6 py-2 rounded-xl text-sm font-medium transition-all ${period === 'monthly' ? 'bg-background shadow text-foreground' : 'text-secondary-foreground hover:text-foreground'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setPeriod('yearly')}
              className={`px-6 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${period === 'yearly' ? 'bg-background shadow text-foreground' : 'text-secondary-foreground hover:text-foreground'}`}
            >
              Yearly
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">SAVE 15%</span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {tiers.map((tier, index) => {
            const price = getPrice(tier);
            const savings = getSavings(tier);
            return (
              <div 
                key={index}
                className={`relative rounded-3xl p-8 flex flex-col border transition-all ${tier.popular 
                  ? 'border-primary bg-secondary/40 scale-[1.01] shadow-xl shadow-primary/5' 
                  : 'border-secondary bg-secondary/30'}`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold tracking-[1.5px] px-5 py-1 rounded-full">
                    MOST POPULAR
                  </div>
                )}

                <div className="mb-8">
                  <div className="font-semibold text-xl tracking-tight">{tier.name}</div>
                  <div className="mt-1 text-secondary-foreground text-sm h-10">{tier.description}</div>

                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-6xl font-bold tracking-[-2.5px]">${price}</span>
                    <span className="text-secondary-foreground ml-1">/mo</span>
                  </div>

                  {period === 'yearly' && savings && (
                    <div className="text-emerald-400 text-sm mt-1 font-medium">
                      ${tier.yearlyPrice} billed yearly • Save {savings}%
                    </div>
                  )}
                  {period === 'monthly' && (
                    <div className="text-xs text-secondary-foreground mt-1">Billed monthly</div>
                  )}
                </div>

                <div className="space-y-2 mb-6">
                  <div className="text-xs uppercase tracking-widest text-primary/80 font-medium mb-1">Included</div>
                  <div className="font-medium text-lg">{tier.messages}</div>
                  <div className="text-secondary-foreground">{tier.model}</div>
                </div>

                <ul className="space-y-[13px] text-[15px] mb-8 flex-1">
                  {tier.features.map((feature, fIndex) => (
                    <li key={fIndex} className="flex gap-3 leading-tight">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="pt-4 border-t border-secondary/70">
                  <Link 
                    to={tier.ctaLink}
                    className={`block w-full text-center py-3.5 rounded-2xl font-semibold transition-all ${tier.popular 
                      ? 'bg-primary hover:bg-primary/90 text-primary-foreground' 
                      : 'border border-secondary hover:bg-secondary/60'}`}
                  >
                    {tier.cta} <ArrowRight className="inline h-4 w-4 ml-1" />
                  </Link>
                  <div className="text-center text-xs text-secondary-foreground mt-3">
                    7-day free trial • {tier.overage}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Cost & Value Note */}
        <div className="max-w-2xl mx-auto mt-12 text-center text-sm text-secondary-foreground">
          Prices are designed for healthy margins after real OpenAI token usage and Woztell messaging fees. 
          Overages are transparent and charged only when you go over. 
          We monitor average usage and will suggest the right plan as you grow.
        </div>

        <div className="text-center mt-8">
          <Link to="/" className="text-sm text-secondary-foreground hover:text-primary underline underline-offset-4">
            ← Back to homepage
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-secondary py-8 px-6 text-center text-sm text-secondary-foreground">
        <div>© {new Date().getFullYear()} WolfPack Media LLC — AI-native systems that make businesses impossible to ignore.</div>
      </footer>
    </div>
  );
}
