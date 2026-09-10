import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LegalFooter from '../components/LegalFooter';
import LanguageSwitcher from '../components/LanguageSwitcher';

type BillingPeriod = 'monthly' | 'yearly';

/**
 * Prices and plan identity live in code; every word lives in the resource files.
 * Plan NAMES are deliberately not translated — they are product names and they
 * are what appears on the customer's invoice.
 */
interface TierPricing {
  id: 'starter' | 'growth' | 'pro' | 'agency';
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  popular?: boolean;
  ctaLink: string;
  sales?: boolean;
}

const TIER_PRICING: TierPricing[] = [
  { id: 'starter', name: 'Starter', monthlyPrice: 29, yearlyPrice: 290, ctaLink: '/signup' },
  { id: 'growth', name: 'Growth', monthlyPrice: 79, yearlyPrice: 790, ctaLink: '/signup' },
  { id: 'pro', name: 'Pro', monthlyPrice: 199, yearlyPrice: 1990, popular: true, ctaLink: '/signup' },
  { id: 'agency', name: 'Agency', monthlyPrice: 499, yearlyPrice: 4990, ctaLink: '/signup', sales: true },
];

export default function Pricing() {
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const { t } = useTranslation(['pricing', 'common']);
  const tList = <T,>(key: string): T[] => t(key, { returnObjects: true }) as T[];

  const getPrice = (tier: TierPricing) => {
    return period === 'monthly' ? tier.monthlyPrice : tier.yearlyPrice;
  };

  const getSavings = (tier: TierPricing) => {
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
            <img
              src="/WolfPack_Media_AI_logo_only_icon.png"
              alt="WolfPack AI"
              className="h-10 w-10 rounded-xl bg-white object-contain p-0.5 shadow-sm"
            />
            <div>
              <div className="font-semibold text-lg">{t('common:brand')}</div>
              <div className="text-[10px] text-secondary-foreground -mt-1">{t('common:brandSub')}</div>
            </div>
          </Link>

          <div className="flex items-center gap-3 sm:gap-4 text-sm">
            <LanguageSwitcher />
            <Link to="/" className="text-secondary-foreground hover:text-foreground transition-colors px-3 py-1.5">
              Home
            </Link>
            <Link 
              to="/login" 
              className="px-4 py-1.5 rounded-lg hover:bg-secondary text-secondary-foreground hover:text-foreground transition-colors"
            >
              {t('common:nav.login')}
            </Link>
            <Link 
              to="/signup" 
              className="px-5 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              Start your free 7-day trial
            </Link>
          </div>
        </div>
      </nav>

      <div className="pt-20 pb-12 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-secondary/60 border border-secondary text-xs tracking-[1px] mb-4">
            TRANSPARENT & FAIR
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tighter mb-4">{t('pricing:title')}</h1>
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
              {t('pricing:monthly')}
            </button>
            <button
              onClick={() => setPeriod('yearly')}
              className={`px-6 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${period === 'yearly' ? 'bg-background shadow text-foreground' : 'text-secondary-foreground hover:text-foreground'}`}
            >
              {t('pricing:yearly')}
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">{t('pricing:save')}</span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {TIER_PRICING.map((tier, index) => {
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
                  <div className="mt-1 text-secondary-foreground text-sm h-10">{t(`pricing:tiers.${tier.id}.description`)}</div>

                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-6xl font-bold tracking-[-2.5px]">${price}</span>
                    <span className="text-secondary-foreground ml-1">{t('pricing:perMonth')}</span>
                  </div>

                  {period === 'yearly' && savings && (
                    <div className="text-emerald-400 text-sm mt-1 font-medium">
                      ${tier.yearlyPrice} billed yearly • Save {savings}%
                    </div>
                  )}
                  {period === 'monthly' && (
                    <div className="text-xs text-secondary-foreground mt-1">{t('pricing:billedMonthly')}</div>
                  )}
                </div>

                <div className="space-y-2 mb-6">
                  <div className="text-xs uppercase tracking-widest text-primary/80 font-medium mb-1">Included</div>
                  <div className="font-medium text-lg">{t(`pricing:tiers.${tier.id}.messages`)}</div>
                  <div className="text-secondary-foreground">{t(`pricing:tiers.${tier.id}.aiBenefit`)}</div>
                </div>

                <ul className="space-y-[13px] text-[15px] mb-8 flex-1">
                  {tList<string>(`pricing:tiers.${tier.id}.features`).map((feature, fIndex) => (
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
                    {tier.sales ? t('pricing:ctaSales') : t('pricing:ctaTrial')} <ArrowRight className="inline h-4 w-4 ml-1" />
                  </Link>
                  <div className="text-center text-xs text-secondary-foreground mt-3">
                    {t('pricing:trialLine')} • {tier.sales ? t('pricing:volumePricing') : t('pricing:noOverage')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Cost & Value Note */}
        <div className="max-w-2xl mx-auto mt-12 text-center text-sm text-secondary-foreground">
          {t('pricing:note')}
        </div>

        <div className="text-center mt-8">
          <Link to="/" className="text-sm text-secondary-foreground hover:text-primary underline underline-offset-4">
            {t('pricing:backHome')}
          </Link>
        </div>
      </div>

      {/* Footer */}
      <LegalFooter className="border-t border-secondary py-8 px-6" />
    </div>
  );
}
