export type SimulatorChannelType = 'instagram' | 'facebook' | 'whatsapp' | 'web_chat' | 'test';

export interface TestInput {
  channel_type: SimulatorChannelType;
  message: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
}

export interface TestValidationErrors {
  channel_type?: string;
  message?: string;
}

export interface TestConversationPayload {
  client_id: string;
  source_channel: SimulatorChannelType;
  initial_message: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  test_mode: true;
  status: 'test';
}

export interface SimulatedReply {
  reply: string;
  lead_signals: {
    intent: string;
    service_interest?: string;
    full_name?: string;
    email?: string;
    phone?: string;
  };
  should_trigger_automation: boolean;
  extracted_lead: Record<string, string>;
}

export interface SimulatorCompletion {
  testsRun: number;
  successful: number;
  percentComplete: number;
  blockers: string[];
  ready: boolean;
}

function extractName(message: string): string | undefined {
  const match = message.match(/(?:my name is|i am|im|I'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  return match ? match[1].trim() : undefined;
}

function extractEmail(message: string): string | undefined {
  const match = message.match(/[\w.-]+@[\w.-]+\.\w+/);
  return match ? match[0] : undefined;
}

function extractPhone(message: string): string | undefined {
  // Keep original formatting for display in test UI
  const match = message.match(/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/);
  return match ? match[0] : undefined;
}

function detectService(message: string): string | undefined {
  const lower = message.toLowerCase();
  if (lower.includes('whiten')) return 'whitening';
  if (lower.includes('clean')) return 'cleaning';
  if (lower.includes('book') || lower.includes('appointment')) return 'booking';
  if (lower.includes('price') || lower.includes('cost')) return 'pricing';
  return undefined;
}

export function validateTestInput(input: Partial<TestInput>): TestValidationErrors {
  const errors: TestValidationErrors = {};

  if (!input.channel_type) {
    errors.channel_type = 'Select a test channel.';
  }
  if (!input.message || input.message.trim().length < 3) {
    errors.message = 'Enter a test customer message.';
  }
  return errors;
}

export function buildTestMessagePayload(input: TestInput, clientId: string): TestConversationPayload {
  return {
    client_id: clientId,
    source_channel: input.channel_type,
    initial_message: input.message.trim(),
    customer_name: input.customer_name || extractName(input.message),
    customer_email: input.customer_email || extractEmail(input.message),
    customer_phone: input.customer_phone || extractPhone(input.message),
    test_mode: true,
    status: 'test',
  };
}

export function simulateAgentReply(params: {
  message: string;
  business_name: string;
  agent_name: string;
  knowledge_snippets?: string[];
}): SimulatedReply {
  const { message, business_name, agent_name, knowledge_snippets = [] } = params;
  const lower = message.toLowerCase();

  let reply = `Hi! I'm ${agent_name} from ${business_name}. `;
  const service = detectService(message);

  if (service) {
    reply += `We do offer ${service}. `;
  }

  if (knowledge_snippets.length > 0) {
    reply += knowledge_snippets[0] + ' ';
  }

  reply += `Would you like me to check availability or send more details?`;

  const lead_signals = {
    intent: lower.includes('book') || lower.includes('appointment') ? 'booking_request' : 'service_inquiry',
    service_interest: service,
    full_name: extractName(message),
    email: extractEmail(message),
    phone: extractPhone(message),
  };

  const should_trigger_automation = !!service || lower.includes('price') || lower.includes('book');

  return {
    reply,
    lead_signals,
    should_trigger_automation,
    extracted_lead: {
      ...(lead_signals.full_name ? { full_name: lead_signals.full_name } : {}),
      ...(lead_signals.email ? { email: lead_signals.email } : {}),
      ...(lead_signals.phone ? { phone: lead_signals.phone } : {}),
      service_interest: service || 'general inquiry',
    },
  };
}

export function extractLeadFromTest(params: { message: string; agent_reply: string }): Record<string, string> {
  const { message } = params;
  return {
    full_name: extractName(message) || '',
    email: extractEmail(message) || '',
    phone: extractPhone(message) || '',
    service_interest: detectService(message) || 'general inquiry',
  };
}

export function getSimulatorCompletion(testRuns: { success: boolean }[]): SimulatorCompletion {
  const testsRun = testRuns.length;
  const successful = testRuns.filter(r => r.success).length;

  const blockers: string[] = [];
  if (testsRun === 0) {
    blockers.push('Run at least one successful test conversation and confirm a lead + automation was triggered.');
  }

  return {
    testsRun,
    successful,
    percentComplete: testsRun === 0 ? 0 : Math.round((successful / testsRun) * 100),
    blockers,
    ready: blockers.length === 0,
  };
}
