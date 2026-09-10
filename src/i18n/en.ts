const common = {
  brand: 'WolfPack AI',
  brandSub: 'DM Agent',
  nav: {
    pricing: 'Pricing',
    login: 'Log in',
    startTrialShort: 'Start free trial',
    startTrial: 'Start your free 7-day trial',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    language: 'Language',
    english: 'English',
    spanish: 'Español',
  },
  trialMicrocopy: 'No credit card required • 7-day free trial • Cancel anytime',
};

const landing = {
  hero: {
    badge: 'Instagram & Facebook · AI powered',
    headlineA: 'AI that answers your DMs,',
    headlineB: 'qualifies leads and books calls',
    sub: "Your own AI agent, answering Instagram and Facebook messages around the clock — in English and Spanish, in your brand's voice.",
    seePricing: 'See pricing',
    mockupAlt:
      "The WolfPack AI inbox: a customer message arrives on Instagram, the AI agent answers in the customer's own language, and the lead is captured automatically.",
  },
  trust: {
    label: 'BUILT FOR BUSINESSES THAT LIVE IN THEIR DMs',
    items: ['AGENCIES', 'HEALTHCARE & DENTAL', 'HOSPITALITY', 'PROFESSIONAL SERVICES', 'ECOMMERCE'],
  },
  how: {
    eyebrow: 'SELF-SERVE IN MINUTES',
    title: 'How it works',
    sub: 'Five simple steps from zero to live AI agent.',
    steps: [
      {
        title: 'Connect Channels',
        desc: "Link your Facebook Page and Instagram Professional account through Meta's official login in minutes.",
      },
      {
        title: 'Quick Setup',
        desc: 'Fill Business Profile, Agent Instructions, and add your services, FAQs, and policies to the Knowledge Base.',
      },
      {
        title: 'Train & Test',
        desc: 'Use the built-in Test Agent simulator to generate sample conversations and verify lead capture + automations.',
      },
      {
        title: 'Launch Checklist',
        desc: 'Run the automated readiness checks. When everything is green, flip the switch.',
      },
      {
        title: 'AI Goes Live',
        desc: 'Your AI DM Agent handles inbound messages 24/7, qualifies leads, and routes them exactly as you configured.',
      },
    ],
  },
  features: {
    eyebrow: 'BUILT FOR REAL BUSINESSES',
    title: 'Everything you need to own your DMs',
    items: [
      {
        title: '24/7 Replies, in Both Languages',
        desc: "Your agent answers Instagram and Facebook DMs instantly, in your brand voice — and in English or Spanish, matching whichever the customer writes in.",
      },
      {
        title: 'Smart Lead Qualification',
        desc: 'Automatically captures name, contact info, intent, and service interest. Only serious leads reach your team.',
      },
      {
        title: 'Leads Where You Work',
        desc: "The moment a lead is qualified it goes straight out to Zapier, Make, n8n or any webhook you use — and lands in your team's inbox by email.",
      },
      {
        title: 'Risk-Free Test Agent',
        desc: 'Simulate real conversations and test your automations before connecting live channels.',
      },
      {
        title: 'Every Conversation, Kept',
        desc: 'Each thread and captured lead is saved with the context around it, so you can open any conversation and pick it up knowing exactly what was already said.',
      },
      {
        title: 'Complete Self-Serve Control',
        desc: 'Update your profile, knowledge base, instructions, and automations anytime. No support tickets needed.',
      },
    ],
  },
  pricingTeaser: {
    eyebrow: 'TRANSPARENT PRICING',
    title: 'Simple plans. Real results.',
    sub: 'Start free — 1,000 messages or 7 days, whichever comes first, counting messages sent and received. No credit card required.',
    viewDetails: 'View details',
    perMonth: '/mo',
    allPlansBefore: 'See all plans including Agency on the ',
    allPlansLink: 'full pricing page',
    allPlansAfter: '. Yearly plans available with savings.',
    starterFeatures: [
      '1 connected channel',
      '1 AI bot',
      '500 conversations/mo',
      'Human handoff inbox',
      'Basic automations',
    ],
    growthFeatures: [
      '3 connected channels',
      '2 AI bots',
      '2,500 conversations/mo',
      'Human handoff inbox',
      'Priority support',
    ],
    proFeatures: [
      '10 connected channels',
      '3 AI bots',
      '10,000 conversations/mo',
      'Human handoff inbox',
      'Lead capture & automations',
      'Priority support',
    ],
    mostPopular: 'MOST POPULAR',
  },
  faq: {
    title: 'Common questions',
    items: [
      {
        q: 'How accurate is the AI?',
        a: "It answers from the knowledge you give it — your services, prices, policies — and it is built to say a team member will follow up rather than invent an answer it doesn't have. The Test Agent lets you rehearse real conversations and adjust the wording before a single customer sees it.",
      },
      {
        q: 'Does it reply in Spanish?',
        a: "Yes. Your agent answers in whichever language the customer writes in, English or Spanish, using your business's own wording in both. You don't configure anything per conversation.",
      },
      {
        q: "What happens if I hit my plan's limit?",
        a: "Nothing is charged automatically — there are no surprise bills and no overage rate. When you reach your plan's conversation limit your agent pauses instead of quietly running up a charge, and your dashboard shows where you stand all month long. Upgrade whenever you're ready; every conversation and captured lead stays exactly where it is.",
      },
      {
        q: 'Can I cancel anytime?',
        a: "Yes. Cancel from your dashboard. You'll keep access until the end of the billing period.",
      },
      {
        q: 'Do I need a business account?',
        a: 'You need a Facebook Page, and an Instagram Professional (Business or Creator) account linked to it — Meta only allows messaging apps to connect to Pages, never to personal profiles. Both are free and take a few minutes to set up. Your customers need nothing special: they message you from ordinary Instagram and Facebook accounts.',
      },
      {
        q: 'Do I need technical skills?',
        a: "No. The entire setup is self-serve with guided steps, a powerful simulator, and a Launch Checklist that tells you exactly what's missing.",
      },
    ],
  },
  finalCta: {
    title: 'Ready to stop manually replying to DMs?',
    sub: 'Get your AI DM Agent live in the next 15 minutes.',
    microcopy: 'No credit card • 7-day free trial • Cancel anytime',
  },
};

const pricing = {
  title: 'Pricing that scales with you',
  monthly: 'Monthly',
  yearly: 'Yearly',
  save: 'SAVE 15%',
  billedMonthly: 'Billed monthly',
  perMonth: '/mo',
  backHome: '← Back to homepage',
  trialLine: 'Free trial: 1,000 messages or 7 days, whichever comes first',
  note: "Prices scale with your conversation volume, and there are no overage charges: when you reach your plan's limit your agent pauses rather than running up a bill, and your dashboard shows where you stand all month. Upgrade when you're ready — your conversations and captured leads stay exactly where they are.",
  noOverage: 'No overage charges — your agent pauses at the limit',
  volumePricing: 'Volume pricing available',
  // Plan NAMES stay in English in both languages — they are product names, and
  // "Growth"/"Pro" are what the customer sees on their invoice.
  tiers: {
    starter: {
      description: 'Perfect for small businesses getting started with AI-powered DMs.',
      messages: '1 channel • 500 conversations/mo',
      aiBenefit: 'Reliable AI replies for everyday conversations',
      features: [
        '1 connected channel (Instagram or Facebook)',
        '1 AI bot with your brand voice & knowledge',
        '500 conversations per month',
        '50 captured leads per month',
        'Human handoff inbox included',
        'Basic automations & email support',
        'Launch Checklist & Test Agent',
        'Free trial: 1,000 messages or 7 days, whichever comes first',
      ],
    },
    growth: {
      description: 'For growing businesses handling real DM volume.',
      messages: '3 channels • 2,500 conversations/mo',
      aiBenefit: 'Advanced replies and lead qualification',
      features: [
        '3 connected channels',
        '2 AI bots',
        '2,500 conversations per month',
        'Human handoff inbox',
        'Priority support',
        'Full automations (Zapier, webhooks, Resend)',
        'Advanced lead capture',
        'Unlimited history & Test Agent',
      ],
    },
    pro: {
      description: 'The sweet spot for serious operators. Most popular plan.',
      messages: '10 channels • 10,000 conversations/mo',
      aiBenefit: 'Priority AI performance for higher-volume teams',
      features: [
        '10 connected channels',
        '3 AI bots',
        '10,000 conversations per month',
        'Human handoff inbox',
        'Priority support (same-day)',
        'Lead capture & full automations',
        'White-label ready',
        'Unlimited history & Launch Checklist',
      ],
    },
    agency: {
      description: 'For agencies and high-volume businesses with multiple brands.',
      messages: 'Unlimited channels & conversations',
      aiBenefit: 'High-volume AI operations with dedicated support',
      features: [
        'Unlimited connected channels',
        '10 AI bots',
        'Unlimited conversations',
        'Dedicated support & onboarding',
        'Lead capture & automations',
        'Full white-label',
        'API access & custom integrations',
        'Multi-brand / multi-location ready',
      ],
    },
  },
  ctaTrial: 'Start your free 7-day trial',
  ctaSales: 'Contact sales',
};

const auth = {
  login: {
    title: 'Welcome back',
    sub: 'Sign in to your account to continue',
    google: 'Continue with Google',
    noAccount: "Don't have an account?",
    signUp: 'Sign up',
    failed: 'Login failed. Please try again.',
  },
  signup: {
    haveAccount: 'Already have an account?',
    title: 'Create your account',
    google: 'Sign up with Google',
    failed: 'Failed to sign up',
  },
  form: {
    email: 'Email',
    emailPlaceholder: 'you@example.com',
    password: 'Password',
    passwordPlaceholder: 'Your password',
    newPasswordPlaceholder: 'At least 8 characters',
    name: 'Full name',
    namePlaceholder: 'Jane Doe',
    processing: 'Processing...',
    emailLabel: 'Email Address',
    passwordLabel: 'Password',
    forgot: 'Forgot password?',
    signIn: 'Sign In',
    createAccount: 'Create Account',
    nameLabel: 'Full Name',
  },
};

export default { common, landing, pricing, auth };
