import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {

  MessageCircle,
  Zap,
  Play,
  CheckCircle2,
  ArrowRight,
  Shield,
  Target,
  BarChart3,
  Menu,
  X
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import LegalFooter from '../components/LegalFooter';
import ProductMockup from '../components/marketing/ProductMockup';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t } = useTranslation(['landing', 'common']);
  // returnObjects gives the arrays of steps / features / FAQ entries straight
  // out of the resource file, so adding a card is a copy change, not a code one.
  const tList = <T,>(key: string): T[] => t(key, { returnObjects: true }) as T[];

  // Redirect logged-in users to the dashboard
  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const scrollToPricing = () => {
    const el = document.getElementById('pricing-teaser');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Icons stay in code; every string comes from the resource files.
  const featureIcons = [MessageCircle, Target, Zap, Play, BarChart3, Shield];
  const features = tList<{ title: string; desc: string }>('landing:features.items')
    .map((f, i) => ({ ...f, icon: featureIcons[i] }));

  const howItWorks = tList<{ title: string; desc: string }>('landing:how.steps');

  const faqs = tList<{ q: string; a: string }>('landing:faq.items');

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Public Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-b border-secondary">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/WolfPack_Media_AI_logo_only_icon.png"
              alt="WolfPack AI"
              className="h-10 w-10 rounded-xl bg-white object-contain p-0.5 shadow-sm"
            />
            <div>
              <div className="font-semibold text-lg">{t('common:brand')}</div>
              <div className="text-[10px] text-secondary-foreground -mt-1">{t('common:brandSub')}</div>
            </div>
          </div>

          {/* Desktop nav. Below md the trial CTA alone is wider than a phone,
              so the three links move into the menu instead of overflowing. */}
          <div className="hidden md:flex items-center gap-4 text-sm">
            <LanguageSwitcher />
            <Link to="/pricing" className="text-secondary-foreground hover:text-foreground transition-colors px-3 py-1.5">
              {t('common:nav.pricing')}
            </Link>
            <Link
              to="/login"
              className="px-4 py-1.5 rounded-lg hover:bg-secondary text-secondary-foreground hover:text-foreground transition-colors"
            >
              {t('common:nav.login')}
            </Link>
            <Link
              to="/signup"
              className="px-5 py-1.5 bg-primary hover:bg-primary/90 text-background rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {t('common:nav.startTrialShort')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="md:hidden p-2 -mr-2 rounded-lg text-secondary-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label={mobileMenuOpen ? t('common:nav.closeMenu') : t('common:nav.openMenu')}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-secondary bg-background/95 backdrop-blur-md">
            <div className="px-6 py-4 flex flex-col gap-2 text-sm">
              <Link
                to="/pricing"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 text-secondary-foreground hover:text-foreground transition-colors"
              >
                {t('common:nav.pricing')}
              </Link>
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 text-secondary-foreground hover:text-foreground transition-colors"
              >
                {t('common:nav.login')}
              </Link>
              <Link
                to="/signup"
                onClick={() => setMobileMenuOpen(false)}
                className="mt-1 px-5 py-2.5 bg-primary hover:bg-primary/90 text-background rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {t('common:nav.startTrial')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden px-5 sm:px-6 pt-24 sm:pt-28 pb-16 sm:pb-20">
        <div className="relative mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-secondary bg-secondary/60 px-3.5 py-1.5 text-xs sm:text-sm mb-6 sm:mb-8">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            {t('landing:hero.badge')}
          </div>

          {/*
            No hard <br /> in the headline. The old markup pinned three line
            breaks that only work at English word lengths — Spanish runs 15-25%
            longer and would have broken the hero the moment it was translated.
            Balanced wrapping inside a max-width does the same job in any
            language.
          */}
          <h1 className="mx-auto max-w-4xl text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08] text-balance">
            <span className="bg-gradient-to-b from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">
              {t('landing:hero.headlineA')}{' '}
            </span>
            <span className="bg-gradient-to-r from-primary via-cyan-400 to-primary bg-clip-text text-transparent">
              {t('landing:hero.headlineB')}
            </span>
          </h1>

          <p className="mx-auto mt-5 sm:mt-6 max-w-xl text-base sm:text-lg lg:text-xl text-secondary-foreground text-balance">
            {t('landing:hero.sub')}
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center gap-2.5 rounded-2xl bg-primary px-7 py-3.5 text-base sm:text-lg font-semibold text-background shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              {t('common:nav.startTrial')}
              <ArrowRight className="h-5 w-5" />
            </Link>
            <button
              onClick={scrollToPricing}
              className="inline-flex items-center justify-center gap-2.5 rounded-2xl border border-secondary bg-secondary px-7 py-3.5 text-base sm:text-lg font-medium text-foreground transition-all hover:bg-secondary/80"
            >
              {t('landing:hero.seePricing')}
            </button>
          </div>

          <p className="mt-4 text-xs sm:text-sm text-secondary-foreground">
            {t('common:trialMicrocopy')}
          </p>
        </div>

        <div className="mt-14 sm:mt-20">
          <ProductMockup />
        </div>
      </section>

      {/* WHO IT IS FOR.
          These are target industries, not a customer list. The row previously
          sat unlabelled at 70% opacity exactly where a logo wall goes, which
          read as "these businesses use us". Labelled, it says the true thing. */}
      <section className="border-y border-secondary bg-secondary/30 py-8">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="text-center text-[11px] tracking-[2px] text-secondary-foreground mb-5">
            {t('landing:trust.label')}
          </div>
          <div className="flex flex-wrap justify-center items-center gap-x-8 sm:gap-x-12 gap-y-4 opacity-70 text-xs sm:text-sm tracking-widest">
            {tList<string>('landing:trust.items').map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <div className="text-primary text-sm font-medium tracking-[2px] mb-3">{t('landing:how.eyebrow')}</div>
          <h2 className="text-4xl font-bold tracking-tight">{t('landing:how.title')}</h2>
          <p className="mt-3 text-xl text-secondary-foreground max-w-md mx-auto">{t('landing:how.sub')}</p>
        </div>

        <div className="grid md:grid-cols-5 gap-6">
          {howItWorks.map((item, index) => (
            <motion.div 
              key={index}
              whileHover={{ y: -4 }}
              className="relative bg-secondary/50 border border-secondary rounded-2xl p-6 flex flex-col"
            >
              <div className="text-4xl font-bold text-primary/60 mb-4">{index + 1}</div>
              <h3 className="font-semibold text-xl mb-2">{item.title}</h3>
              <p className="text-secondary-foreground text-[15px] leading-relaxed flex-1">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* KEY FEATURES */}
      <section className="bg-secondary/20 border-y border-secondary py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="text-primary text-sm font-medium tracking-[2px] mb-3">{t('landing:features.eyebrow')}</div>
            <h2 className="text-4xl font-bold tracking-tight">{t('landing:features.title')}</h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div 
                key={index}
                whileHover={{ scale: 1.01 }}
                className="group bg-background border border-secondary hover:border-primary/30 rounded-2xl p-7 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/15 transition-colors">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-xl mb-3">{feature.title}</h3>
                <p className="text-secondary-foreground leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING TEASER */}
      <section id="pricing-teaser" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <div className="text-primary text-sm font-medium tracking-[2px] mb-3">{t('landing:pricingTeaser.eyebrow')}</div>
          <h2 className="text-4xl font-bold tracking-tight mb-3">{t('landing:pricingTeaser.title')}</h2>
          <p className="text-xl text-secondary-foreground">{t('landing:pricingTeaser.sub')}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Starter */}
          <div className="rounded-3xl border border-secondary bg-secondary/30 p-8 flex flex-col">
            <div>
              <div className="font-semibold">Starter</div>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tighter">$29</span>
                <span className="text-secondary-foreground">{t('landing:pricingTeaser.perMonth')}</span>
              </div>
            </div>
            <ul className="mt-8 space-y-3 text-sm flex-1">
              {tList<string>('landing:pricingTeaser.starterFeatures').map((f, i) => (
                <li key={i} className="flex items-start gap-3"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /> {f}</li>
              ))}
            </ul>
            <Link to="/pricing" className="mt-8 block text-center py-3 rounded-2xl border border-secondary hover:bg-secondary/50 transition-colors font-medium">{t('landing:pricingTeaser.viewDetails')}</Link>
          </div>

          {/* Growth */}
          <div className="rounded-3xl border border-secondary bg-secondary/30 p-8 flex flex-col">
            <div>
              <div className="font-semibold">Growth</div>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tighter">$79</span>
                <span className="text-secondary-foreground">{t('landing:pricingTeaser.perMonth')}</span>
              </div>
            </div>
            <ul className="mt-8 space-y-3 text-sm flex-1">
              {tList<string>('landing:pricingTeaser.growthFeatures').map((f, i) => (
                <li key={i} className="flex items-start gap-3"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /> {f}</li>
              ))}
            </ul>
            <Link to="/signup" className="mt-8 block text-center py-3.5 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-colors">
              {t('common:nav.startTrial')}
            </Link>
          </div>

          {/* Pro - Most Popular */}
          <div className="rounded-3xl border-2 border-primary bg-secondary/30 p-8 flex flex-col relative">
            <div className="absolute -top-3 right-6 bg-primary text-primary-foreground text-xs font-semibold tracking-widest px-4 py-1 rounded-full">{t('landing:pricingTeaser.mostPopular')}</div>
            <div>
              <div className="font-semibold">Pro</div>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tighter">$199</span>
                <span className="text-secondary-foreground">{t('landing:pricingTeaser.perMonth')}</span>
              </div>
            </div>
            <ul className="mt-8 space-y-3 text-sm flex-1">
              {tList<string>('landing:pricingTeaser.proFeatures').map((f, i) => (
                <li key={i} className="flex items-start gap-3"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /> {f}</li>
              ))}
            </ul>
            <Link to="/signup" className="mt-8 block text-center py-3.5 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-colors">
              {t('common:nav.startTrial')}
            </Link>
          </div>
        </div>
        <div className="text-center mt-8 text-sm text-secondary-foreground">
          {t('landing:pricingTeaser.allPlansBefore')}
          <Link to="/pricing" className="underline">{t('landing:pricingTeaser.allPlansLink')}</Link>
          {t('landing:pricingTeaser.allPlansAfter')}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 pb-20">
        <h2 className="text-center text-3xl font-bold mb-10 tracking-tight">{t('landing:faq.title')}</h2>
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div key={index} className="border border-secondary rounded-2xl p-6 bg-secondary/20">
              <div className="font-semibold mb-2">{faq.q}</div>
              <p className="text-secondary-foreground">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-t border-secondary bg-secondary/30 py-16 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-bold tracking-tight mb-4">{t('landing:finalCta.title')}</h2>
          <p className="text-xl text-secondary-foreground mb-8">{t('landing:finalCta.sub')}</p>
          
          <Link 
            to="/signup" 
            className="inline-flex items-center justify-center gap-3 px-10 py-4 bg-primary hover:bg-primary/90 text-primary-foreground text-lg font-semibold rounded-2xl transition-all"
          >
            {t('common:nav.startTrial')}
            <ArrowRight className="h-5 w-5" />
          </Link>
          <div className="text-sm text-secondary-foreground mt-4">{t('landing:finalCta.microcopy')}</div>
        </div>
      </section>

      {/* Footer */}
      <LegalFooter className="border-t border-secondary py-8 px-6" />
    </div>
  );
}
