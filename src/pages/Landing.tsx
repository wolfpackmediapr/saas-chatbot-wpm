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
import { useAuth } from '../contexts/AuthContext';
import LegalFooter from '../components/LegalFooter';
import ProductMockup from '../components/marketing/ProductMockup';

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const features = [
    {
      icon: MessageCircle,
      title: "24/7 Replies, in Both Languages",
      desc: "Your agent answers Instagram and Facebook DMs instantly, in your brand voice — and in English or Spanish, matching whichever the customer writes in."
    },
    {
      icon: Target,
      title: "Smart Lead Qualification",
      desc: "Automatically captures name, contact info, intent, and service interest. Only serious leads reach your team."
    },
    {
      // CRM handoff deliberately not claimed here: the CRM card writes
      // metadata.config, the dashboard reads metadata.crm_url and the processor
      // reads metadata.webhook_url — three different keys, so it cannot deliver.
      // Zapier / Make / n8n webhooks and the Resend email both work today.
      icon: Zap,
      title: "Leads Where You Work",
      desc: "The moment a lead is qualified it goes straight out to Zapier, Make, n8n or any webhook you use — and lands in your team's inbox by email."
    },
    {
      icon: Play,
      title: "Risk-Free Test Agent",
      desc: "Simulate real conversations and test your automations before connecting live channels."
    },
    {
      // "Search, filter" removed: the Leads page has neither.
      icon: BarChart3,
      title: "Every Conversation, Kept",
      desc: "Each thread and captured lead is saved with the context around it, so you can open any conversation and pick it up knowing exactly what was already said."
    },
    {
      icon: Shield,
      title: "Complete Self-Serve Control",
      desc: "Update your profile, knowledge base, instructions, and automations anytime. No support tickets needed."
    }
  ];

  const howItWorks = [
    {
      step: "1",
      title: "Connect Channels",
      desc: "Link your Facebook Page and Instagram Professional account through Meta's official login in minutes."
    },
    {
      step: "2",
      title: "Quick Setup",
      desc: "Fill Business Profile, Agent Instructions, and add your services, FAQs, and policies to the Knowledge Base."
    },
    {
      step: "3",
      title: "Train & Test",
      desc: "Use the built-in Test Agent simulator to generate sample conversations and verify lead capture + automations."
    },
    {
      step: "4",
      title: "Launch Checklist",
      desc: "Run the automated readiness checks. When everything is green, flip the switch."
    },
    {
      step: "5",
      title: "AI Goes Live",
      desc: "Your AI DM Agent handles inbound messages 24/7, qualifies leads, and routes them exactly as you configured."
    }
  ];

  const faqs = [
    {
      q: "How accurate is the AI?",
      a: "It answers from the knowledge you give it — your services, prices, policies — and it is built to say a team member will follow up rather than invent an answer it doesn't have. The Test Agent lets you rehearse real conversations and adjust the wording before a single customer sees it."
    },
    {
      q: "Does it reply in Spanish?",
      a: "Yes. Your agent answers in whichever language the customer writes in, English or Spanish, using your business's own wording in both. You don't configure anything per conversation."
    },
    {
      // Rewritten 2026-09-09. This previously promised "you'll be notified and
      // charged a fair per-message overage rate (clearly shown on the Pricing
      // page)". Overage billing is not implemented, the rate was on no page, and
      // what actually happens is the opposite: the agent pauses and nobody is
      // charged. Say what the product does.
      q: "What happens if I hit my plan's limit?",
      a: "Nothing is charged automatically — there are no surprise bills and no overage rate. When you reach your plan's conversation limit your agent pauses instead of quietly running up a charge, and your dashboard shows where you stand all month long. Upgrade whenever you're ready; every conversation and captured lead stays exactly where it is."
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes. Cancel from your dashboard. You'll keep access until the end of the billing period."
    },
    {
      q: "Do I need a business account?",
      a: "You need a Facebook Page, and an Instagram Professional (Business or Creator) account linked to it \u2014 Meta only allows messaging apps to connect to Pages, never to personal profiles. Both are free and take a few minutes to set up. Your customers need nothing special: they message you from ordinary Instagram and Facebook accounts."
    },
    {
      q: "Do I need technical skills?",
      a: "No. The entire setup is self-serve with guided steps, a powerful simulator, and a Launch Checklist that tells you exactly what's missing."
    }
  ];

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
              <div className="font-semibold text-lg">WolfPack AI</div>
              <div className="text-[10px] text-secondary-foreground -mt-1">DM Agent</div>
            </div>
          </div>

          {/* Desktop nav. Below md the trial CTA alone is wider than a phone,
              so the three links move into the menu instead of overflowing. */}
          <div className="hidden md:flex items-center gap-4 text-sm">
            <Link to="/pricing" className="text-secondary-foreground hover:text-foreground transition-colors px-3 py-1.5">
              Pricing
            </Link>
            <Link
              to="/login"
              className="px-4 py-1.5 rounded-lg hover:bg-secondary text-secondary-foreground hover:text-foreground transition-colors"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="px-5 py-1.5 bg-primary hover:bg-primary/90 text-background rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="md:hidden p-2 -mr-2 rounded-lg text-secondary-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
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
                Pricing
              </Link>
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 text-secondary-foreground hover:text-foreground transition-colors"
              >
                Log in
              </Link>
              <Link
                to="/signup"
                onClick={() => setMobileMenuOpen(false)}
                className="mt-1 px-5 py-2.5 bg-primary hover:bg-primary/90 text-background rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                Start your free 7-day trial
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
            Instagram &amp; Facebook · AI powered
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
              AI that answers your DMs,{' '}
            </span>
            <span className="bg-gradient-to-r from-primary via-cyan-400 to-primary bg-clip-text text-transparent">
              qualifies leads and books calls
            </span>
          </h1>

          <p className="mx-auto mt-5 sm:mt-6 max-w-xl text-base sm:text-lg lg:text-xl text-secondary-foreground text-balance">
            Your own AI agent, answering Instagram and Facebook messages around the clock —
            in English and Spanish, in your brand's voice.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center gap-2.5 rounded-2xl bg-primary px-7 py-3.5 text-base sm:text-lg font-semibold text-background shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              Start your free 7-day trial
              <ArrowRight className="h-5 w-5" />
            </Link>
            <button
              onClick={scrollToPricing}
              className="inline-flex items-center justify-center gap-2.5 rounded-2xl border border-secondary bg-secondary px-7 py-3.5 text-base sm:text-lg font-medium text-foreground transition-all hover:bg-secondary/80"
            >
              See pricing
            </button>
          </div>

          <p className="mt-4 text-xs sm:text-sm text-secondary-foreground">
            No credit card required • 7-day free trial • Cancel anytime
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
            BUILT FOR BUSINESSES THAT LIVE IN THEIR DMs
          </div>
          <div className="flex flex-wrap justify-center items-center gap-x-8 sm:gap-x-12 gap-y-4 opacity-70 text-xs sm:text-sm tracking-widest">
            <div>AGENCIES</div>
            <div>HEALTHCARE &amp; DENTAL</div>
            <div>HOSPITALITY</div>
            <div>PROFESSIONAL SERVICES</div>
            <div>ECOMMERCE</div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <div className="text-primary text-sm font-medium tracking-[2px] mb-3">SELF-SERVE IN MINUTES</div>
          <h2 className="text-4xl font-bold tracking-tight">How it works</h2>
          <p className="mt-3 text-xl text-secondary-foreground max-w-md mx-auto">Five simple steps from zero to live AI agent.</p>
        </div>

        <div className="grid md:grid-cols-5 gap-6">
          {howItWorks.map((item, index) => (
            <motion.div 
              key={index}
              whileHover={{ y: -4 }}
              className="relative bg-secondary/50 border border-secondary rounded-2xl p-6 flex flex-col"
            >
              <div className="text-4xl font-bold text-primary/60 mb-4">{item.step}</div>
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
            <div className="text-primary text-sm font-medium tracking-[2px] mb-3">BUILT FOR REAL BUSINESSES</div>
            <h2 className="text-4xl font-bold tracking-tight">Everything you need to own your DMs</h2>
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
          <div className="text-primary text-sm font-medium tracking-[2px] mb-3">TRANSPARENT PRICING</div>
          <h2 className="text-4xl font-bold tracking-tight mb-3">Simple plans. Real results.</h2>
          <p className="text-xl text-secondary-foreground">Start free — 1,000 messages or 7 days, whichever comes first, counting messages sent and received. No credit card required.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Starter */}
          <div className="rounded-3xl border border-secondary bg-secondary/30 p-8 flex flex-col">
            <div>
              <div className="font-semibold">Starter</div>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tighter">$29</span>
                <span className="text-secondary-foreground">/mo</span>
              </div>
            </div>
            <ul className="mt-8 space-y-3 text-sm flex-1">
              {["1 connected channel", "1 AI bot", "500 conversations/mo", "Human handoff inbox", "Basic automations"].map((f, i) => (
                <li key={i} className="flex items-start gap-3"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /> {f}</li>
              ))}
            </ul>
            <Link to="/pricing" className="mt-8 block text-center py-3 rounded-2xl border border-secondary hover:bg-secondary/50 transition-colors font-medium">View details</Link>
          </div>

          {/* Growth */}
          <div className="rounded-3xl border border-secondary bg-secondary/30 p-8 flex flex-col">
            <div>
              <div className="font-semibold">Growth</div>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tighter">$79</span>
                <span className="text-secondary-foreground">/mo</span>
              </div>
            </div>
            <ul className="mt-8 space-y-3 text-sm flex-1">
              {["3 connected channels", "2 AI bots", "2,500 conversations/mo", "Human handoff inbox", "Priority support"].map((f, i) => (
                <li key={i} className="flex items-start gap-3"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /> {f}</li>
              ))}
            </ul>
            <Link to="/signup" className="mt-8 block text-center py-3.5 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-colors">
              Start your free 7-day trial
            </Link>
          </div>

          {/* Pro - Most Popular */}
          <div className="rounded-3xl border-2 border-primary bg-secondary/30 p-8 flex flex-col relative">
            <div className="absolute -top-3 right-6 bg-primary text-primary-foreground text-xs font-semibold tracking-widest px-4 py-1 rounded-full">MOST POPULAR</div>
            <div>
              <div className="font-semibold">Pro</div>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tighter">$199</span>
                <span className="text-secondary-foreground">/mo</span>
              </div>
            </div>
            <ul className="mt-8 space-y-3 text-sm flex-1">
              {["10 connected channels", "3 AI bots", "10,000 conversations/mo", "Human handoff inbox", "Lead capture & automations", "Priority support"].map((f, i) => (
                <li key={i} className="flex items-start gap-3"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /> {f}</li>
              ))}
            </ul>
            <Link to="/signup" className="mt-8 block text-center py-3.5 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-colors">
              Start your free 7-day trial
            </Link>
          </div>
        </div>
        <div className="text-center mt-8 text-sm text-secondary-foreground">
          See all plans including Agency on the <Link to="/pricing" className="underline">full pricing page</Link>. Yearly plans available with savings.
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 pb-20">
        <h2 className="text-center text-3xl font-bold mb-10 tracking-tight">Common questions</h2>
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
          <h2 className="text-4xl font-bold tracking-tight mb-4">Ready to stop manually replying to DMs?</h2>
          <p className="text-xl text-secondary-foreground mb-8">Get your AI DM Agent live in the next 15 minutes.</p>
          
          <Link 
            to="/signup" 
            className="inline-flex items-center justify-center gap-3 px-10 py-4 bg-primary hover:bg-primary/90 text-primary-foreground text-lg font-semibold rounded-2xl transition-all"
          >
            Start your free 7-day trial
            <ArrowRight className="h-5 w-5" />
          </Link>
          <div className="text-sm text-secondary-foreground mt-4">No credit card • 7-day free trial • Cancel anytime</div>
        </div>
      </section>

      {/* Footer */}
      <LegalFooter className="border-t border-secondary py-8 px-6" />
    </div>
  );
}
