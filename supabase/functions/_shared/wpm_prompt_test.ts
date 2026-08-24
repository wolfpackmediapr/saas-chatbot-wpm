import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildWpmAssistantMessages,
  buildWpmSystemPrompt,
  HUMAN_REPLY_PREFIX,
  stripHumanReplyMarker,
  type WpmBotContext,
} from './wpm_prompt.ts';

const context: WpmBotContext = {
  client: {
    id: 'client-uuid',
    name: 'Demo Restaurant',
    description: 'Family-run restaurant serving the San Juan metro area.',
    services: 'Catering, private dining, brunch events',
    location: 'San Juan, Puerto Rico',
    industry: 'restaurant',
    timezone: 'America/Puerto_Rico',
    website_url: 'https://example.com',
    contact_email: 'hola@example.com',
    contact_phone: '+1 787 555 0100',
  },
  botProfile: {
    id: 'bot-profile-uuid',
    public_name: 'Demo Concierge',
    tone: 'premium, direct, friendly',
    language: 'en',
    response_length: 'concise',
    booking_url: 'https://example.com/book',
    handoff_contact: 'team@example.com',
    model_provider: 'openai',
    model_name: 'gpt-4.1-mini',
  },
  instructions: {
    system_prompt: 'Represent the business accurately and never invent availability.',
    business_summary: 'Upscale Puerto Rico restaurant focused on private events and catering.',
    faq_instructions: 'Hours: Tue-Sun 11am-9pm. Closed Monday.',
    lead_qualification_instructions: 'Collect name, phone, date, party size, and service interest.',
    handoff_rules: 'Escalate urgent complaints or booking changes.',
    never_say_rules: 'Never promise a reservation is confirmed without staff approval.',
    primary_goal: 'Book a meeting',
    response_language: 'English + Latin American Spanish',
    emergency_keywords: ['allergy', 'refund'],
    lead_fields: ['name', 'phone', 'date', 'party_size'],
  },
  knowledge: [
    { title: 'Menu summary', content_text: 'Popular services: catering, private dining, brunch events.' },
  ],
};

Deno.test('buildWpmSystemPrompt assembles client, instruction, lead, handoff, and knowledge context', () => {
  const prompt = buildWpmSystemPrompt(context);

  assertStringIncludes(prompt, 'Demo Restaurant');
  assertStringIncludes(prompt, 'Demo Concierge');
  assertStringIncludes(prompt, 'Represent the business accurately');
  assertStringIncludes(prompt, 'Collect name, phone, date, party size');
  assertStringIncludes(prompt, 'Never promise a reservation is confirmed');
  assertStringIncludes(prompt, 'Popular services: catering');
  assertStringIncludes(prompt, 'https://example.com/book');
});

// California's B.O.T. Act requires a bot used to move someone toward a
// transaction to admit it is not human. The agent's primary goal is booking, so
// the disclosure has to survive whatever persona a tenant writes — including one
// that gives the bot a human name and backstory.
Deno.test('buildWpmSystemPrompt always requires the agent to admit it is an AI', () => {
  const humanPersona: WpmBotContext = {
    ...context,
    instructions: {
      ...context.instructions!,
      system_prompt: 'You are Maria, a real person on the front desk. Never mention AI.',
      never_say_rules: 'Never say you are a bot.',
    },
  };

  const prompt = buildWpmSystemPrompt(humanPersona);

  assertStringIncludes(prompt, 'always answer truthfully that you are an AI assistant');
  assertStringIncludes(prompt, 'NEVER claim to be a human');

  // The tenant's persona is still applied — it just cannot outrank the rule,
  // which is why the disclosure has to come after it in the assembled prompt.
  assertStringIncludes(prompt, 'You are Maria');
  const disclosureAt = prompt.indexOf('always answer truthfully that you are an AI assistant');
  const personaAt = prompt.indexOf('You are Maria');
  assertEquals(disclosureAt > personaAt, true, 'disclosure rule must come after the tenant persona');
});

Deno.test('buildWpmSystemPrompt includes the Business Profile fields the agent introduces itself with', () => {
  const prompt = buildWpmSystemPrompt(context);

  assertStringIncludes(prompt, 'Family-run restaurant serving the San Juan metro area.');
  assertStringIncludes(prompt, 'Catering, private dining, brunch events');
  assertStringIncludes(prompt, 'San Juan, Puerto Rico');
  assertStringIncludes(prompt, 'hola@example.com');
  assertStringIncludes(prompt, '+1 787 555 0100');
});

Deno.test('buildWpmSystemPrompt turns the bilingual setting into a no-mixing language rule', () => {
  const prompt = buildWpmSystemPrompt(context);

  assertStringIncludes(prompt, 'respond ENTIRELY in that same language');
  assertStringIncludes(prompt, 'NEVER mix languages in a single response.');
});

Deno.test('buildWpmSystemPrompt offers the booking link when the goal needs one', () => {
  const prompt = buildWpmSystemPrompt(context);

  assertStringIncludes(prompt, 'book a discovery call: https://example.com/book');
});

// Regression guard: this used to fall back to one specific business's own
// scheduling link, so any customer without a booking URL sent their leads to
// another tenant's calendar. A missing link must produce no link at all.
Deno.test('buildWpmSystemPrompt never substitutes another tenant’s booking link', () => {
  const withoutLink: WpmBotContext = {
    ...context,
    botProfile: { ...context.botProfile, booking_url: null },
  };

  const prompt = buildWpmSystemPrompt(withoutLink);

  assertEquals(prompt.includes('https://example.com/book'), false);
  assertEquals(prompt.includes('calendly.com'), false);
  assertStringIncludes(prompt, 'never invent one');
  assertStringIncludes(prompt, 'collect their');
});

Deno.test('buildWpmSystemPrompt falls back to a sane goal and language when instructions are missing', () => {
  const bare: WpmBotContext = { ...context, instructions: null };

  const prompt = buildWpmSystemPrompt(bare);

  // Defaults are 'Book a meeting' + bilingual — an agent with no instruction
  // row must still get a goal and a language rule rather than an empty prompt.
  assertStringIncludes(prompt, 'discovery call');
  assertStringIncludes(prompt, 'NEVER mix languages in a single response.');
});

Deno.test('buildWpmAssistantMessages creates OpenAI-compatible chat messages with recent conversation history', () => {
  const messages = buildWpmAssistantMessages(context, [
    { role: 'user', content: 'Do you do private events?' },
    { role: 'assistant', content: 'Yes. What date and party size are you considering?' },
  ], 'I need catering for 30 people this Friday.');

  assertEquals(messages.at(0)?.role, 'system');
  assertEquals(messages.at(-1), {
    role: 'user',
    content: 'I need catering for 30 people this Friday.',
  });
  assertEquals(messages.slice(1), [
    { role: 'user', content: 'Do you do private events?' },
    { role: 'assistant', content: 'Yes. What date and party size are you considering?' },
    { role: 'user', content: 'I need catering for 30 people this Friday.' },
  ]);
});

// ── Shared content vs unanswerable questions ──────────────────────────────
//
// 60 shared reels all drew the same canned line, because rule 6 tells the
// model to say it verbatim for anything "not covered in the provided
// context" -- and a shared reel is not covered by definition. The fallback
// must survive for real questions while shared content gets a real reply.

Deno.test('the default fallback is still required for unanswerable questions', () => {
  const prompt = buildWpmSystemPrompt(context);
  assertStringIncludes(prompt, "That's a great question");
  assertStringIncludes(prompt, 'someone from our team follows up');
});

Deno.test('the fallback is scoped to questions, not to everything', () => {
  // Without this scoping, sharing a reel counts as "not covered" and the
  // canned line fires every time.
  const prompt = buildWpmSystemPrompt(context);
  assertStringIncludes(prompt, 'If asked a QUESTION about something not covered');
});

Deno.test('shared reels, posts and story mentions get their own instruction', () => {
  const prompt = buildWpmSystemPrompt(context);
  assertStringIncludes(prompt, 'When someone SHARES something rather than asking a question');
  assertStringIncludes(prompt, 'Sharing is interest, not an unanswerable question');
  assertStringIncludes(prompt, 'story mention');
});

Deno.test('engaging with shared content must not license inventing services', () => {
  // Rule 4 is what stops "connect it to a service" becoming a fabrication.
  const prompt = buildWpmSystemPrompt(context);
  assertStringIncludes(prompt, 'never invent a service to make the connection');
  assertStringIncludes(prompt, '4. NEVER invent, fabricate, or assume facts');
});

Deno.test('hard rules explain the human-teammate marker and forbid echoing it', () => {
  const prompt = buildWpmSystemPrompt(context);
  // The rule must quote the exact marker wpm_ai.ts writes, or the model is
  // being told about a label it never actually sees.
  assertStringIncludes(prompt, HUMAN_REPLY_PREFIX);
  assertStringIncludes(prompt, 'written by a person on the team');
  assertStringIncludes(prompt, 'NEVER write that marker yourself');
});

Deno.test('a labelled human turn survives into the message array as an assistant turn', () => {
  const messages = buildWpmAssistantMessages(
    context,
    [{ role: 'assistant', content: `${HUMAN_REPLY_PREFIX} what number is best?` }],
    'for you to call me',
  );

  assertEquals(messages[1], {
    role: 'assistant',
    content: `${HUMAN_REPLY_PREFIX} what number is best?`,
  });
  assertEquals(messages[messages.length - 1], { role: 'user', content: 'for you to call me' });
});

Deno.test('the teammate marker is stripped from anything the model writes', () => {
  // Rule 10 forbids it; this is the guarantee. The marker is internal and a
  // customer must never see it, however the model misbehaves.
  assertEquals(
    stripHumanReplyMarker(`${HUMAN_REPLY_PREFIX} I can call you at 3pm.`),
    'I can call you at 3pm.',
  );
  assertEquals(
    stripHumanReplyMarker(`Sure! ${HUMAN_REPLY_PREFIX} My colleague said 3pm.`),
    'Sure! My colleague said 3pm.',
  );
  // Ordinary replies pass through untouched.
  assertEquals(stripHumanReplyMarker('Happy to help — what works for you?'), 'Happy to help — what works for you?');
});

Deno.test('stripping the marker never reformats an ordinary reply', () => {
  // The agent legitimately sends line breaks — booking links, short lists.
  // Collapsing them would be a visible regression on every single reply.
  const multiline = 'Great — here is the link:\n\nhttps://calendly.com/wolfpackmediapr\n\nSee you then!';
  assertEquals(stripHumanReplyMarker(multiline), multiline);
  // And line breaks survive even when the marker is removed.
  assertEquals(
    stripHumanReplyMarker(`${HUMAN_REPLY_PREFIX} Here you go:\n\nhttps://example.com`),
    'Here you go:\n\nhttps://example.com',
  );
});
