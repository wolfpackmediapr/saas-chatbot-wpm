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
