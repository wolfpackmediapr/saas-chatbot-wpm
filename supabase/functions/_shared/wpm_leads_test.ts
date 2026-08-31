import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildLeadUpsertPayload,
  buildToolExecutionPayload,
  extractLeadFromConversationText,
  persistQualifiedLeadAndQueueActions,
  type ExtractedLead,
} from './wpm_leads.ts';

function ok(data: unknown) {
  return { data, error: null };
}

class QueryStub {
  private table: string;
  private db: Record<string, unknown>;

  constructor(table: string, db: Record<string, unknown>) {
    this.table = table;
    this.db = db;
  }

  select(_columns?: string) {
    return this;
  }

  eq(_column: string, _value: unknown) {
    return this;
  }

  in(_column: string, _value: unknown[]) {
    return this;
  }

  insert(payload: unknown) {
    (this.db.inserts as Array<{ table: string; payload: unknown }>).push({ table: this.table, payload });
    return this;
  }

  upsert(payload: unknown, _options?: unknown) {
    (this.db.upserts as Array<{ table: string; payload: unknown }>).push({ table: this.table, payload });
    return this;
  }

  single() {
    const latestInsert = (this.db.inserts as Array<{ table: string; payload: unknown }>).at(-1);
    if (this.table === 'wpm_leads' && latestInsert?.table === 'wpm_leads') {
      return Promise.resolve(ok({ id: 'lead-uuid', ...(latestInsert.payload as Record<string, unknown>) }));
    }
    if (this.table === 'wpm_tool_executions' && latestInsert?.table === 'wpm_tool_executions') {
      return Promise.resolve(ok({ id: 'tool-execution-uuid', ...(latestInsert.payload as Record<string, unknown>) }));
    }

    return Promise.resolve(ok(this.db[`${this.table}:single`] ?? null));
  }

  then(resolve: (value: unknown) => void) {
    if (this.table === 'wpm_integrations') {
      return Promise.resolve(ok(this.db['wpm_integrations:list'] ?? [])).then(resolve);
    }
    return Promise.resolve(ok([])).then(resolve);
  }
}

class SupabaseStub {
  db: Record<string, unknown>;

  constructor(db: Record<string, unknown>) {
    this.db = db;
  }

  from(table: string) {
    return new QueryStub(table, this.db);
  }
}

const extractedLead: ExtractedLead = {
  isQualified: true,
  fullName: 'Jane Rivera',
  email: 'jane@example.com',
  phone: '+17875550123',
  serviceInterest: 'private dining',
  intent: 'booking_request',
  qualificationData: {
    date: 'Friday',
    party_size: 30,
    budget: null,
  },
  sourceChannel: 'instagram',
};

Deno.test('extractLeadFromConversationText finds contact info, service interest, and qualification details', () => {
  assertEquals(extractLeadFromConversationText({
    inboundText: 'My name is Jane Rivera. I need private dining for 30 people this Friday. Call me at +17875550123 or jane@example.com.',
    assistantText: 'Yes — we can help with private dining. What time should we request?',
    sourceChannel: 'instagram',
  }), {
    isQualified: true,
    fullName: 'Jane Rivera',
    email: 'jane@example.com',
    phone: '+17875550123',
    serviceInterest: 'private dining',
    intent: 'booking_request',
    qualificationData: {
      party_size: 30,
      requested_date: 'Friday',
    },
    sourceChannel: 'instagram',
  });
});

Deno.test('buildLeadUpsertPayload maps extracted lead fields into wpm_leads columns', () => {
  assertEquals(buildLeadUpsertPayload({
    clientId: 'client-uuid',
    conversationId: 'conversation-uuid',
    lead: extractedLead,
    nowIso: '2026-06-05T12:00:00.000Z',
  }), {
    client_id: 'client-uuid',
    conversation_id: 'conversation-uuid',
    full_name: 'Jane Rivera',
    email: 'jane@example.com',
    phone: '+17875550123',
    service_interest: 'private dining',
    intent: 'booking_request',
    qualification_data: {
      date: 'Friday',
      party_size: 30,
      budget: null,
    },
    source_channel: 'instagram',
    status: 'qualified',
    last_contact_at: '2026-06-05T12:00:00.000Z',
  });
});

Deno.test('buildToolExecutionPayload creates CRM/Zapier action payload without exposing secrets', () => {
  assertEquals(buildToolExecutionPayload({
    clientId: 'client-uuid',
    conversationId: 'conversation-uuid',
    integration: {
      id: 'integration-uuid',
      provider: 'zapier',
      integration_type: 'zapier_webhook',
      name: 'Qualified Lead Zap',
      field_map: { name: 'full_name', phone: 'phone' },
      metadata: { trigger: 'qualified_lead' },
    },
    leadId: 'lead-uuid',
    lead: extractedLead,
  }), {
    client_id: 'client-uuid',
    conversation_id: 'conversation-uuid',
    integration_id: 'integration-uuid',
    tool_name: 'zapier.qualified_lead',
    input_payload: {
      lead_id: 'lead-uuid',
      integration_name: 'Qualified Lead Zap',
      provider: 'zapier',
      integration_type: 'zapier_webhook',
      field_map: { name: 'full_name', phone: 'phone' },
      lead: extractedLead,
    },
    status: 'pending',
  });
});

Deno.test('persistQualifiedLeadAndQueueActions inserts qualified lead and queues active lead integrations', async () => {
  const supabase = new SupabaseStub({
    inserts: [],
    upserts: [],
    'wpm_integrations:list': [
      {
        id: 'integration-uuid',
        provider: 'zapier',
        integration_type: 'zapier_webhook',
        name: 'Qualified Lead Zap',
        field_map: { name: 'full_name', phone: 'phone' },
        metadata: { trigger: 'qualified_lead' },
      },
    ],
  });

  const result = await persistQualifiedLeadAndQueueActions({
    supabase,
    clientId: 'client-uuid',
    conversationId: 'conversation-uuid',
    lead: extractedLead,
    nowIso: '2026-06-05T12:00:00.000Z',
  });

  assertEquals(result, {
    ok: true,
    leadId: 'lead-uuid',
    queuedToolExecutionIds: ['tool-execution-uuid'],
    skipped: false,
    error: null,
  });
  assertEquals((supabase.db.inserts as Array<{ table: string }>)[0].table, 'wpm_leads');
  assertEquals((supabase.db.inserts as Array<{ table: string }>)[1].table, 'wpm_tool_executions');
});

Deno.test('persistQualifiedLeadAndQueueActions skips unqualified leads without database writes', async () => {
  const supabase = new SupabaseStub({ inserts: [], upserts: [] });

  const result = await persistQualifiedLeadAndQueueActions({
    supabase,
    clientId: 'client-uuid',
    conversationId: 'conversation-uuid',
    lead: { ...extractedLead, isQualified: false, phone: null, email: null },
    nowIso: '2026-06-05T12:00:00.000Z',
  });

  assertEquals(result, {
    ok: true,
    leadId: null,
    queuedToolExecutionIds: [],
    skipped: true,
    error: null,
  });
  assertEquals(supabase.db.upserts, []);
  assertEquals(supabase.db.inserts, []);
});

// ── Regression: the agent's own words are not the customer's identity ──────
//
// Two real leads were stored as "Discovery Meeting" (08-21) and "Discovery
// Call" (08-23) because extraction scanned the agent's reply, which offers
// "[Discovery Call](https://calendly.com/...)". The customer's actual name was
// sitting in their own message both times.

Deno.test('the agent offering a Discovery Call never becomes the lead name', () => {
  const lead = extractLeadFromConversationText({
    inboundText: 'Ok Williamson Smithweson\nMindsethubpr@gmail.com\n\n7875557332',
    assistantText:
      'Thanks, Williamson! The best way to get exact details is through a quick discovery call. ' +
      'You can book a time that works for you here: [Discovery Call](https://calendly.com/wolfpackmediapr/wpm-discovery-meeting).',
    sourceChannel: 'instagram',
  });

  assertEquals(lead.fullName, 'Williamson Smithweson');
  assertEquals(lead.email, 'Mindsethubpr@gmail.com');
  assertEquals(lead.phone, '7875557332');
  assertEquals(lead.isQualified, true);
});

Deno.test('leading filler does not throw away an otherwise good name', () => {
  // "Ok" is a stopword; rejecting the whole candidate for it is what sent
  // extraction to the fallback that read the agent's text.
  assertEquals(
    extractLeadFromConversationText({
      inboundText: 'Ok Williamson Smithweson someone@example.com booking',
      sourceChannel: 'instagram',
    }).fullName,
    'Williamson Smithweson',
  );
});

Deno.test('a markdown link in the customer message is not a name either', () => {
  assertEquals(
    extractLeadFromConversationText({
      inboundText: '[Discovery Call](https://calendly.com/x) jane@example.com booking',
      sourceChannel: 'instagram',
    }).fullName,
    null,
  );
});

Deno.test('contact details are never taken from the agent reply', () => {
  // If the agent mentions a business address, that is ours, not the lead's.
  const lead = extractLeadFromConversationText({
    inboundText: 'I want a booking',
    assistantText: 'Email us at hello@wolfpackmediapr.com or call 7875550000.',
    sourceChannel: 'instagram',
  });

  assertEquals(lead.email, null);
  assertEquals(lead.phone, null);
  assertEquals(lead.isQualified, false); // no customer contact means no lead
});

Deno.test('the agent may still confirm what the lead wants', () => {
  // Context is allowed to come from either side -- only identity is restricted.
  const lead = extractLeadFromConversationText({
    inboundText: 'Jane Rivera jane@example.com, is Friday possible?',
    assistantText: 'We can do private dining on Friday.',
    sourceChannel: 'instagram',
  });

  assertEquals(lead.fullName, 'Jane Rivera');
  assertEquals(lead.serviceInterest, 'private dining');
  assertEquals(lead.isQualified, true);
});

// ── Single-word first names ───────────────────────────────────────────────
//
// Plenty of people give only a first name. A lone capitalised word in prose is
// far more likely to be a subject than a person, so single words are trusted
// only inside a "here are my details" block.

Deno.test('a lone first name in a details block is captured', () => {
  assertEquals(
    extractLeadFromConversationText({
      inboundText: 'Wilfre\n8598147330\ngoldenpinepplerecs@gmail.com',
      sourceChannel: 'instagram',
    }).fullName,
    'Wilfre',
  );
});

Deno.test('a lone first name above an email is captured', () => {
  assertEquals(
    extractLeadFromConversationText({
      inboundText: 'Jane\njane@example.com\nbooking',
      sourceChannel: 'instagram',
    }).fullName,
    'Jane',
  );
});

Deno.test('a subject word in the name position is not a person', () => {
  assertEquals(
    extractLeadFromConversationText({
      inboundText: 'Chatbot\nme@example.com\nbooking',
      sourceChannel: 'instagram',
    }).fullName,
    null,
  );
});

Deno.test('"I am interested" is not a name', () => {
  // This shipped as a lead named "Interested In": the introduction rule
  // returned whatever followed "I'm" with no check at all.
  assertEquals(
    extractLeadFromConversationText({
      inboundText: "I'm interested in a chat bot for social media, email me at test@example.com about booking",
      sourceChannel: 'instagram',
    }).fullName,
    null,
  );
});

Deno.test('"I am <name>" still works, including a single first name', () => {
  assertEquals(
    extractLeadFromConversationText({
      inboundText: "I'm Wilfre, jane@example.com, booking",
      sourceChannel: 'instagram',
    }).fullName,
    'Wilfre',
  );
});

Deno.test('a Spanish greeting above contact details is not a name', () => {
  // And nothing below the contact lines is considered: "reservation" trailing
  // after the email used to be picked up as the person's name.
  assertEquals(
    extractLeadFromConversationText({
      inboundText: 'Hola\ncorreo@ejemplo.com\nreservation',
      sourceChannel: 'instagram',
    }).fullName,
    null,
  );
});

Deno.test('prose without a details block still needs two words', () => {
  assertEquals(
    extractLeadFromConversationText({
      inboundText: 'hey I want a booking, reach me at a@b.com',
      sourceChannel: 'instagram',
    }).fullName,
    null,
  );
});

// ── Messengers flatten line breaks ────────────────────────────────────────
//
// Typed on Instagram as three lines, stored as one:
//   "Ok Juan juachi@hotmail.com 7777347330"
// The details-block rule needed 2+ lines, and the adjacency rule rejected the
// lone "Juan" for being one word, so a real lead arrived with no name at all.

Deno.test('a flattened details message still yields the first name', () => {
  assertEquals(
    extractLeadFromConversationText({
      inboundText: 'Ok Juan juachi@hotmail.com 7777347330',
      sourceChannel: 'instagram',
    }).fullName,
    'Juan',
  );
});

Deno.test('a flattened details message still yields a full name', () => {
  assertEquals(
    extractLeadFromConversationText({
      inboundText: 'Ok Williamson Smithweson Mindsethubpr@gmail.com 7875557332',
      sourceChannel: 'instagram',
    }).fullName,
    'Williamson Smithweson',
  );
});

Deno.test('an acknowledgement before contact details is not a name', () => {
  // Accepting single words next to contact info means "Cool jane@..." must not
  // produce a lead named "Cool".
  assertEquals(
    extractLeadFromConversationText({
      inboundText: 'Cool juan@x.com 7875551234',
      sourceChannel: 'instagram',
    }).fullName,
    null,
  );
});

// ── Spanish conversations ─────────────────────────────────────────────────
//
// A live Instagram lead in Spanish -- with a name, an email AND a phone --
// was dropped entirely: isQualified was false because every service and
// intent word in the list was English, and the agent had (correctly) replied
// in Spanish. No lead row, no email, no Zapier, no Slack. In Puerto Rico that
// is not an edge case.

Deno.test('a Spanish handover qualifies and keeps the name', () => {
  const lead = extractLeadFromConversationText({
    inboundText: 'Oka Luiso luisopr@outlook.net 8598147330',
    assistantText:
      'Gracias, Luiso. Un miembro de nuestro equipo se pondrá en contacto contigo. ' +
      'Si prefieres, también puedes programar una llamada directamente usando este enlace: ' +
      '[Calendly Discovery Call](https://calendly.com/wolfpackmediapr/wpm-discovery-meeting).',
    sourceChannel: 'instagram',
  });

  assertEquals(lead.fullName, 'Luiso');
  assertEquals(lead.email, 'luisopr@outlook.net');
  assertEquals(lead.phone, '8598147330');
  assertEquals(lead.isQualified, true);
});

Deno.test('accented Spanish still matches the service list', () => {
  // "contenido de vídeo" must match "contenido de video".
  const lead = extractLeadFromConversationText({
    inboundText: 'Tengo un YouTube channel Uds trabajan contenido de vídeo? luis@x.com',
    sourceChannel: 'instagram',
  });
  assertEquals(lead.isQualified, true);
});

Deno.test('Spanish pricing questions are a pricing_request', () => {
  const lead = extractLeadFromConversationText({
    inboundText: 'Cuanto cuesta? mi correo es ana@x.com',
    sourceChannel: 'instagram',
  });
  assertEquals(lead.intent, 'pricing_request');
  assertEquals(lead.isQualified, true);
});

Deno.test('handing over details qualifies even with no keyword in any language', () => {
  // The language-independent rule: nobody types a name, an email and a phone
  // into a business DM by accident.
  const lead = extractLeadFromConversationText({
    inboundText: 'Luiso luisopr@outlook.net 8598147330',
    sourceChannel: 'instagram',
  });
  assertEquals(lead.isQualified, true);
});

Deno.test('an address mentioned in passing still does not qualify', () => {
  // The handover rule must stay narrow: no name, and only one contact detail.
  const lead = extractLeadFromConversationText({
    inboundText: 'is this the right place? write to support@other.com maybe',
    sourceChannel: 'instagram',
  });
  assertEquals(lead.isQualified, false);
});

Deno.test('a single name mid-sentence, next to contact details, is captured', () => {
  // Live Spanish lead: the name sits inside prose with one capitalised word
  // before the email, so the details-block rule saw too many words and the
  // pair rule wanted two capitalised words. Adjacency is the signal.
  const lead = extractLeadFromConversationText({
    inboundText: 'También coge el número de mi socio y la info de el Carlos carlito@hotmail.com 5553337777',
    sourceChannel: 'instagram',
  });

  assertEquals(lead.fullName, 'Carlos');
  assertEquals(lead.email, 'carlito@hotmail.com');
  assertEquals(lead.isQualified, true);
});

Deno.test('a name before a phone number is captured too', () => {
  assertEquals(
    extractLeadFromConversationText({
      inboundText: 'mi socio es Carlos 5553337777',
      sourceChannel: 'instagram',
    }).fullName,
    'Carlos',
  );
});

Deno.test('a stopword adjacent to contact details is still not a name', () => {
  // The adjacency rule accepts single words, so the stopword list is what
  // stops "correo ana@x.com" or "contacto ana@x.com" becoming a person.
  for (const text of ['correo ana@x.com booking', 'Contacto ana@x.com booking', 'Info ana@x.com booking']) {
    assertEquals(
      extractLeadFromConversationText({ inboundText: text, sourceChannel: 'instagram' }).fullName,
      null,
      `expected no name for: ${text}`,
    );
  }
});

// ─── Asking to be CALLED is its own intent ───────────────────────────────────
// Found live 2026-08-31. A real Instagram lead said "Si pero quiero que me
// llamen", handed over name, email and phone, and was correctly qualified —
// but `intent` came out NULL, because `llamen` is subjunctive and the list
// held only `llamar|llamada`. Slack then posted "... | Via: instagram |
// Wants:" with nothing after the label.

Deno.test('a Spanish subjunctive request to be called is a callback_request', () => {
  const lead = extractLeadFromConversationText({
    inboundText: 'Si pero quiero que me llamen',
    assistantText: 'Entiendo, puedo hacer que un miembro de nuestro equipo te llame.',
    sourceChannel: 'instagram',
  });
  assertEquals(lead.intent, 'callback_request');
});

Deno.test('the English "call me" is a callback_request too', () => {
  const lead = extractLeadFromConversationText({
    inboundText: 'Can someone call me? 7875550123',
    sourceChannel: 'instagram',
  });
  assertEquals(lead.intent, 'callback_request');
});

Deno.test('callback ranks BELOW booking — a booking that mentions calling stays a booking', () => {
  // This is the live shape the old ordering would have broken: the customer
  // wants a table, and happens to leave a phone number to be reached on.
  const lead = extractLeadFromConversationText({
    inboundText: 'I need private dining for 30 people this Friday. Call me at +17875550123.',
    sourceChannel: 'instagram',
  });
  assertEquals(lead.intent, 'booking_request');
});

Deno.test('the agent offering to call does NOT invent a callback intent', () => {
  // The agent writes "se pondrá en contacto contigo" in nearly every capture
  // reply. If intent read our own boilerplate, every lead would carry the same
  // label and the column would say nothing at all.
  const lead = extractLeadFromConversationText({
    inboundText: 'Ok gracias Ana ana@x.com 7875550123',
    assistantText:
      'Un miembro de nuestro equipo se pondrá en contacto contigo y te llamara pronto.',
    sourceChannel: 'instagram',
  });
  assertEquals(lead.intent, null);
  // Still qualifies — handing over details is the intent, per the 08-22 rule.
  assertEquals(lead.isQualified, true);
});

Deno.test('Spanish conjugations of booking verbs are matched from the customer side', () => {
  const lead = extractLeadFromConversationText({
    inboundText: 'Quiero agendarme para la proxima semana, mi correo es luis@x.com',
    sourceChannel: 'instagram',
  });
  assertEquals(lead.intent, 'booking_request');
});
