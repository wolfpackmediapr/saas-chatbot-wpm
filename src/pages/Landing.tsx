import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Bot, 
  MessageCircle, 
  Users, 
  Zap, 
  Play, 
  CheckCircle2, 
  ArrowRight, 
  Shield, 
  Clock,
  Target,
  BarChart3
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();

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
      title: "24/7 Intelligent Replies",
      desc: "AI responds instantly to DMs on WhatsApp, Instagram & Facebook using your exact brand voice and knowledge."
    },
    {
      icon: Target,
      title: "Smart Lead Qualification",
      desc: "Automatically captures name, contact info, intent, and service interest. Only serious leads reach your team."
    },
    {
      icon: Zap,
      title: "Powerful Automations",
      desc: "Trigger Zapier, Resend emails, webhooks, or CRM handoffs the moment a qualified lead is captured."
    },
    {
      icon: Play,
      title: "Risk-Free Test Agent",
      desc: "Simulate real conversations and test your automations before connecting live channels."
    },
    {
      icon: BarChart3,
      title: "Full Lead Database & History",
      desc: "Every conversation and qualified lead is saved with context. Search, filter, and follow up easily."
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
      desc: "Link your WhatsApp Business or Instagram via official Woztell in minutes."
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
      a: "Very accurate when you provide good knowledge and instructions. The Test Agent lets you iterate quickly until replies match your voice and policies."
    },
    {
      q: "What happens if I exceed my plan messages?",
      a: "You'll be notified and charged a fair per-message overage rate (clearly shown on the Pricing page). No surprise bills."
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes. Cancel from your dashboard. You'll keep access until the end of the billing period."
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
            <div className="p-2 bg-primary/20 rounded-xl">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="font-semibold text-lg">WolfPack AI</div>
              <div className="text-[10px] text-secondary-foreground -mt-1">DM Agent</div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
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
              className="px-5 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              Start 7-day free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="pt-24 pb-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary/60 border border-secondary mb-6 text-sm">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            Official Woztell + OpenAI powered
          </div>

          <h1 className="text-6xl md:text-7xl font-bold tracking-tighter leading-[0.95] mb-6">
            AI That Answers<br />Your DMs.<br />
            <span className="bg-gradient-to-r from-primary via-cyan-400 to-primary bg-clip-text text-transparent">Qualifies Leads.<br />Books Calls.</span>
          </h1>

          <p className="max-w-2xl mx-auto text-xl md:text-2xl text-secondary-foreground mb-10">
            Deploy your own AI DM Agent in under 15 minutes.<br />
            Never miss another lead in WhatsApp or Instagram again.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              to="/signup" 
              className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-primary hover:bg-primary/90 active:bg-primary/80 text-primary-foreground text-lg font-semibold rounded-2xl transition-all shadow-lg shadow-primary/20"
            >
              Start 7-day free trial
              <ArrowRight className="h-5 w-5" />
            </Link>
            <button 
              onClick={scrollToPricing}
              className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-secondary hover:bg-secondary/80 text-foreground text-lg font-medium rounded-2xl border border-secondary transition-all"
            >
              See pricing
            </button>
          </div>

          <p className="text-sm text-secondary-foreground mt-4">No credit card required • Cancel anytime</p>
        </div>
      </section>

      {/* TRUST / SOCIAL PROOF */}
      <section className="border-y border-secondary bg-secondary/30 py-8">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-6 opacity-70 text-sm tracking-widest">
            <div>PR AGENCIES</div>
            <div>HEALTHCARE & DENTAL</div>
            <div>HOSPITALITY</div>
            <div>PROFESSIONAL SERVICES</div>
            <div>ECOMMERCE BRANDS</div>
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
          <p className="text-xl text-secondary-foreground">Start with a 7-day free trial. No credit card needed.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Basic */}
          <div className="rounded-3xl border border-secondary bg-secondary/30 p-8 flex flex-col">
            <div>
              <div className="font-semibold">Basic</div>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tighter">$79</span>
                <span className="text-secondary-foreground">/mo</span>
              </div>
            </div>
            <ul className="mt-8 space-y-3 text-sm flex-1">
              {["400 messages/mo", "GPT-4o-mini", "30-day history", "Basic automations", "Email support"].map((f, i) => (
                <li key={i} className="flex items-start gap-3"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /> {f}</li>
              ))}
            </ul>
            <Link to="/pricing" className="mt-8 block text-center py-3 rounded-2xl border border-secondary hover:bg-secondary/50 transition-colors font-medium">View details</Link>
          </div>

          {/* Professional - Most Popular */}
          <div className="rounded-3xl border-2 border-primary bg-secondary/30 p-8 flex flex-col relative">
            <div className="absolute -top-3 right-6 bg-primary text-primary-foreground text-xs font-semibold tracking-widest px-4 py-1 rounded-full">MOST POPULAR</div>
            <div>
              <div className="font-semibold">Professional</div>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tighter">$179</span>
                <span className="text-secondary-foreground">/mo</span>
              </div>
            </div>
            <ul className="mt-8 space-y-3 text-sm flex-1">
              {["2,000 messages/mo", "Full GPT-4o (best quality)", "Unlimited history & leads", "Full automations (Zapier + webhooks)", "Priority support", "Test Agent + Launch Checklist"].map((f, i) => (
                <li key={i} className="flex items-start gap-3"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /> {f}</li>
              ))}
            </ul>
            <Link 
              to="/signup" 
              className="mt-8 block text-center py-3.5 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-colors"
            >
              Start 7-day free trial
            </Link>
          </div>

          {/* Enterprise */}
          <div className="rounded-3xl border border-secondary bg-secondary/30 p-8 flex flex-col">
            <div>
              <div className="font-semibold">Enterprise</div>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tighter">$449</span>
                <span className="text-secondary-foreground">/mo</span>
              </div>
            </div>
            <ul className="mt-8 space-y-3 text-sm flex-1">
              {["6,000 messages/mo", "GPT-4o + priority processing", "Everything in Professional", "API access", "Dedicated support + onboarding", "Custom integrations"].map((f, i) => (
                <li key={i} className="flex items-start gap-3"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /> {f}</li>
              ))}
            </ul>
            <Link to="/pricing" className="mt-8 block text-center py-3 rounded-2xl border border-secondary hover:bg-secondary/50 transition-colors font-medium">View details & contact sales</Link>
          </div>
        </div>

        <div className="text-center mt-8 text-sm text-secondary-foreground">
          Yearly plans available with 15% savings • Fair overage rates apply
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
            Start your 7-day free trial
            <ArrowRight className="h-5 w-5" />
          </Link>
          <div className="text-sm text-secondary-foreground mt-4">No credit card • Cancel anytime</div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-secondary py-8 px-6 text-center text-sm text-secondary-foreground">
        <div>© {new Date().getFullYear()} WolfPack Media LLC — AI-native systems that make businesses impossible to ignore.</div>
        <div className="mt-1">Puerto Rico • Results, not reports.</div>
      </footer>
    </div>
  );
}
