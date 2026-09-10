/**
 * Puerto Rican Spanish (es-PR), not Spain's.
 *
 * Register: "tú", consistently. This is a sales page for owner-operators in a
 * market where the formal "usted" reads distant and corporate; the brand voice
 * is direct. If that ever changes it has to change EVERYWHERE at once, because
 * mixing the two inside one page is the thing people actually notice.
 *
 * Vocabulary chosen for PR usage: "celular" not "móvil", "computadora" not
 * "ordenador", "correo" not "e-mail". "Ecommerce" and "webhook" are left in
 * English because that is what the market says out loud.
 *
 * ⚠️ This is a REWRITE, not a translation — the marketing lines were composed
 * in Spanish rather than converted word for word. Wilf should read the hero and
 * the FAQ before this ships; a native operator's ear beats mine.
 */

const common = {
  brand: 'WolfPack AI',
  brandSub: 'Agente de DMs',
  nav: {
    pricing: 'Precios',
    login: 'Iniciar sesión',
    startTrialShort: 'Empieza gratis',
    startTrial: 'Empieza tu prueba gratis de 7 días',
    openMenu: 'Abrir menú',
    closeMenu: 'Cerrar menú',
    language: 'Idioma',
    english: 'English',
    spanish: 'Español',
  },
  trialMicrocopy: 'Sin tarjeta de crédito • 7 días gratis • Cancela cuando quieras',
};

const landing = {
  hero: {
    badge: 'Instagram y Facebook · con IA',
    headlineA: 'IA que contesta tus DMs,',
    headlineB: 'califica prospectos y agenda llamadas',
    sub: 'Tu propio agente de IA contestando los mensajes de Instagram y Facebook a toda hora — en español y en inglés, con la voz de tu marca.',
    seePricing: 'Ver precios',
    mockupAlt:
      'El inbox de WolfPack AI: llega un mensaje por Instagram, el agente de IA contesta en el idioma del cliente y el prospecto queda capturado automáticamente.',
  },
  trust: {
    label: 'HECHO PARA NEGOCIOS QUE VIVEN EN SUS DMs',
    items: ['AGENCIAS', 'SALUD Y DENTAL', 'RESTAURANTES Y HOTELES', 'SERVICIOS PROFESIONALES', 'ECOMMERCE'],
  },
  how: {
    eyebrow: 'LISTO EN MINUTOS',
    title: 'Cómo funciona',
    sub: 'Cinco pasos de cero a agente en vivo.',
    steps: [
      {
        title: 'Conecta tus canales',
        desc: 'Enlaza tu página de Facebook y tu cuenta de Instagram Profesional con el login oficial de Meta, en minutos.',
      },
      {
        title: 'Configúralo rápido',
        desc: 'Completa el perfil del negocio y las instrucciones del agente, y añade tus servicios, preguntas frecuentes y políticas a la base de conocimiento.',
      },
      {
        title: 'Practica y prueba',
        desc: 'Usa el simulador Test Agent para generar conversaciones de prueba y verificar la captura de prospectos y las automatizaciones.',
      },
      {
        title: 'Lista de lanzamiento',
        desc: 'Corre las verificaciones automáticas. Cuando todo esté en verde, actívalo.',
      },
      {
        title: 'La IA entra en vivo',
        desc: 'Tu agente contesta los mensajes que entran 24/7, califica prospectos y los envía exactamente como lo configuraste.',
      },
    ],
  },
  features: {
    eyebrow: 'HECHO PARA NEGOCIOS REALES',
    title: 'Todo lo que necesitas para dominar tus DMs',
    items: [
      {
        title: 'Respuestas 24/7, en los dos idiomas',
        desc: 'Tu agente contesta los DMs de Instagram y Facebook al instante, con la voz de tu marca — en español o en inglés, según en cuál te escriba el cliente.',
      },
      {
        title: 'Calificación inteligente de prospectos',
        desc: 'Captura automáticamente el nombre, los datos de contacto, la intención y el servicio que le interesa. A tu equipo solo le llegan los prospectos serios.',
      },
      {
        title: 'Los prospectos donde ya trabajas',
        desc: 'En cuanto un prospecto se califica, sale directo a Zapier, Make, n8n o cualquier webhook que uses — y le llega por correo a tu equipo.',
      },
      {
        title: 'Test Agent, sin riesgo',
        desc: 'Simula conversaciones reales y prueba tus automatizaciones antes de conectar los canales en vivo.',
      },
      {
        title: 'Cada conversación, guardada',
        desc: 'Cada hilo y cada prospecto se guarda con su contexto, para que abras cualquier conversación y le des seguimiento sabiendo exactamente qué ya se habló.',
      },
      {
        title: 'Control total, sin depender de nadie',
        desc: 'Actualiza tu perfil, tu base de conocimiento, las instrucciones y las automatizaciones cuando quieras. Sin tickets de soporte.',
      },
    ],
  },
  pricingTeaser: {
    eyebrow: 'PRECIOS TRANSPARENTES',
    title: 'Planes simples. Resultados reales.',
    sub: 'Empieza gratis — 1,000 mensajes o 7 días, lo que ocurra primero, contando los mensajes enviados y recibidos. Sin tarjeta de crédito.',
    viewDetails: 'Ver detalles',
    perMonth: '/mes',
    allPlansBefore: 'Ve todos los planes, incluyendo Agency, en la ',
    allPlansLink: 'página de precios completa',
    allPlansAfter: '. También hay planes anuales con descuento.',
    starterFeatures: [
      '1 canal conectado',
      '1 agente de IA',
      '500 conversaciones/mes',
      'Inbox con traspaso a humano',
      'Automatizaciones básicas',
    ],
    growthFeatures: [
      '3 canales conectados',
      '2 agentes de IA',
      '2,500 conversaciones/mes',
      'Inbox con traspaso a humano',
      'Soporte prioritario',
    ],
    proFeatures: [
      '10 canales conectados',
      '3 agentes de IA',
      '10,000 conversaciones/mes',
      'Inbox con traspaso a humano',
      'Captura de prospectos y automatizaciones',
      'Soporte prioritario',
    ],
    mostPopular: 'EL MÁS POPULAR',
  },
  faq: {
    title: 'Preguntas frecuentes',
    items: [
      {
        q: '¿Qué tan preciso es el agente?',
        a: 'Contesta con la información que tú le das — tus servicios, precios y políticas — y está hecho para decir que alguien del equipo dará seguimiento en vez de inventarse una respuesta que no tiene. Con el Test Agent puedes ensayar conversaciones reales y ajustar el texto antes de que lo vea un solo cliente.',
      },
      {
        q: '¿Contesta en español?',
        a: 'Sí. Tu agente contesta en el idioma en que te escriba el cliente, español o inglés, usando las palabras de tu propio negocio en los dos. No hay que configurar nada conversación por conversación.',
      },
      {
        q: '¿Qué pasa si llego al límite de mi plan?',
        a: 'No se cobra nada automáticamente — no hay cargos sorpresa ni tarifa por exceso. Cuando llegas al límite de conversaciones de tu plan, tu agente se pausa en vez de seguir acumulando cargos, y tu panel te muestra dónde estás durante todo el mes. Sube de plan cuando estés listo; cada conversación y cada prospecto capturado se queda exactamente donde está.',
      },
      {
        q: '¿Puedo cancelar cuando quiera?',
        a: 'Sí. Cancelas desde tu panel y mantienes el acceso hasta que termine el periodo que ya facturaste.',
      },
      {
        q: '¿Necesito una cuenta de negocio?',
        a: 'Necesitas una página de Facebook y una cuenta de Instagram Profesional (Business o Creator) enlazada a ella — Meta solo permite que las apps de mensajería se conecten a páginas, nunca a perfiles personales. Las dos son gratis y se configuran en unos minutos. Tus clientes no necesitan nada especial: te escriben desde cuentas normales de Instagram y Facebook.',
      },
      {
        q: '¿Necesito saber de tecnología?',
        a: 'No. Todo el proceso lo haces tú mismo, con pasos guiados, un simulador y una lista de lanzamiento que te dice exactamente qué te falta.',
      },
    ],
  },
  finalCta: {
    title: '¿Listo para dejar de contestar DMs a mano?',
    sub: 'Pon tu agente de IA en vivo en los próximos 15 minutos.',
    microcopy: 'Sin tarjeta de crédito • 7 días gratis • Cancela cuando quieras',
  },
};

const pricing = {
  title: 'Precios que crecen contigo',
  monthly: 'Mensual',
  yearly: 'Anual',
  save: 'AHORRA 15%',
  billedMonthly: 'Facturado mensual',
  perMonth: '/mes',
  backHome: '← Volver al inicio',
  trialLine: 'Prueba gratis: 1,000 mensajes o 7 días, lo que ocurra primero',
  note: 'Los precios crecen con tu volumen de conversaciones y no hay cargos por exceso: cuando llegas al límite de tu plan, tu agente se pausa en vez de acumular una factura, y tu panel te muestra dónde estás durante todo el mes. Sube de plan cuando estés listo — tus conversaciones y tus prospectos capturados se quedan exactamente donde están.',
  noOverage: 'Sin cargos por exceso — tu agente se pausa al llegar al límite',
  volumePricing: 'Precios por volumen disponibles',
  // Los NOMBRES de los planes se quedan en inglés: son nombres de producto y es
  // lo que el cliente ve en su factura.
  tiers: {
    starter: {
      description: 'Ideal para negocios pequeños que están empezando con DMs con IA.',
      messages: '1 canal • 500 conversaciones/mes',
      aiBenefit: 'Respuestas confiables para las conversaciones del día a día',
      features: [
        '1 canal conectado (Instagram o Facebook)',
        '1 agente de IA con la voz y el conocimiento de tu marca',
        '500 conversaciones al mes',
        '50 prospectos capturados al mes',
        'Inbox con traspaso a humano incluido',
        'Automatizaciones básicas y soporte por correo',
        'Lista de lanzamiento y Test Agent',
        'Prueba gratis: 1,000 mensajes o 7 días, lo que ocurra primero',
      ],
    },
    growth: {
      description: 'Para negocios que ya manejan volumen real de mensajes.',
      messages: '3 canales • 2,500 conversaciones/mes',
      aiBenefit: 'Respuestas avanzadas y calificación de prospectos',
      features: [
        '3 canales conectados',
        '2 agentes de IA',
        '2,500 conversaciones al mes',
        'Inbox con traspaso a humano',
        'Soporte prioritario',
        'Automatizaciones completas (Zapier, webhooks, Resend)',
        'Captura de prospectos avanzada',
        'Historial ilimitado y Test Agent',
      ],
    },
    pro: {
      description: 'El punto justo para operaciones serias. El plan más popular.',
      messages: '10 canales • 10,000 conversaciones/mes',
      aiBenefit: 'Rendimiento prioritario para equipos de más volumen',
      features: [
        '10 canales conectados',
        '3 agentes de IA',
        '10,000 conversaciones al mes',
        'Inbox con traspaso a humano',
        'Soporte prioritario (mismo día)',
        'Captura de prospectos y automatizaciones completas',
        'Listo para marca blanca',
        'Historial ilimitado y lista de lanzamiento',
      ],
    },
    agency: {
      description: 'Para agencias y negocios de alto volumen con varias marcas.',
      messages: 'Canales y conversaciones ilimitados',
      aiBenefit: 'Operación de alto volumen con soporte dedicado',
      features: [
        'Canales conectados ilimitados',
        '10 agentes de IA',
        'Conversaciones ilimitadas',
        'Soporte y onboarding dedicados',
        'Captura de prospectos y automatizaciones',
        'Marca blanca completa',
        'Acceso a la API e integraciones a la medida',
        'Listo para varias marcas y localidades',
      ],
    },
  },
  ctaTrial: 'Empieza tu prueba gratis de 7 días',
  ctaSales: 'Habla con ventas',
};

const auth = {
  login: {
    title: 'Bienvenido de vuelta',
    sub: 'Inicia sesión para continuar',
    google: 'Continuar con Google',
    noAccount: '¿No tienes cuenta?',
    signUp: 'Crear cuenta',
    failed: 'No pudimos iniciar sesión. Inténtalo de nuevo.',
  },
  signup: {
    haveAccount: '¿Ya tienes cuenta?',
    title: 'Crea tu cuenta',
    google: 'Crear cuenta con Google',
    failed: 'No pudimos crear la cuenta.',
  },
  form: {
    email: 'Correo electrónico',
    emailPlaceholder: 'tu@ejemplo.com',
    password: 'Contraseña',
    passwordPlaceholder: 'Tu contraseña',
    newPasswordPlaceholder: 'Mínimo 8 caracteres',
    name: 'Nombre completo',
    namePlaceholder: 'María Rivera',
    processing: 'Procesando...',
    emailLabel: 'Correo electrónico',
    passwordLabel: 'Contraseña',
    forgot: '¿Olvidaste tu contraseña?',
    signIn: 'Iniciar sesión',
    createAccount: 'Crear cuenta',
    nameLabel: 'Nombre completo',
  },
};

export default { common, landing, pricing, auth };
