import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildKnowledgeText,
  buildWpmAssistantMessages,
  flattenMarkdownLinks,
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

// ─── The configured link must outrank whatever is in the transcript ──────────
// Live incident 2026-08-24: an account changed its booking link, but the agent
// kept sending the OLD url because it appeared in earlier messages of a
// permanent Instagram thread. The url was in no part of the prompt — the model
// was copying it out of the history. Changing a link had no effect on any
// existing conversation.

function promptFor(bookingUrl: string | null): string {
  return buildWpmSystemPrompt({
    ...context,
    botProfile: { ...context.botProfile, booking_url: bookingUrl },
  } as WpmBotContext);
}

Deno.test('the agent is told its configured link overrides any link in the history', () => {
  const prompt = promptFor('https://ai.example.com/book');
  assertStringIncludes(prompt, 'The ONLY link you may share is https://ai.example.com/book');
  assertStringIncludes(prompt, 'do not copy it forward');
  // The "send me that link again" case is what actually reproduced live.
  assertStringIncludes(prompt, 'send that link again');
});

Deno.test('with no link configured the agent may still reuse one it shared itself', () => {
  // Falling back to context is reasonable behaviour, not a bug — there is
  // nothing to override it with. What must stay blocked is inventing a link
  // and, more importantly, treating a link the CUSTOMER pasted as this
  // business's own.
  const prompt = promptFor(null);
  assertStringIncludes(prompt, 'you may send that same one again');
  assertStringIncludes(prompt, 'never invent one');
  assertStringIncludes(prompt, "never treat a link the CUSTOMER pasted as this business's own");
});

Deno.test('a configured link is stated to override the conversation history', () => {
  const prompt = promptFor('https://ai.example.com/book');
  assertStringIncludes(prompt, "OVERRIDES everything else, including this conversation's own history");
});

Deno.test('each agent gets its own link — no shared or hardcoded default', () => {
  // Several agents can live under ONE account, each with a different link.
  // A hardcoded or borrowed default would send one business's leads to
  // another's calendar, which this codebase has already been bitten by once.
  const a = promptFor('https://agent-one.example.com/book');
  const b = promptFor('https://agent-two.example.com/book');

  assertStringIncludes(a, 'https://agent-one.example.com/book');
  assertEquals(a.includes('agent-two.example.com'), false);
  assertStringIncludes(b, 'https://agent-two.example.com/book');
  assertEquals(b.includes('agent-one.example.com'), false);
  // And no vendor link may ever be baked in.
  assertEquals(a.includes('calendly.com'), false);
  assertEquals(b.includes('calendly.com'), false);
});

// ─── Knowledge base size budget ──────────────────────────────────────────────
// Prompt assembly used to inject every source in full. At a few hundred
// characters that is invisible; one pasted PDF would exceed the model's window
// and the agent would stop answering with no error anywhere.

Deno.test('a normal knowledge base is passed through untouched', () => {
  // The live client has ~629 characters. This change must be a no-op there, or
  // it is not a safety fix, it is a behaviour change.
  const text = buildKnowledgeText([
    { title: 'Services', content_text: 'We build AI agents and websites.' },
    { title: 'Hours', content_text: 'Open Tuesday to Sunday.' },
  ]);
  assertEquals(text, '### Services\nWe build AI agents and websites.\n\n### Hours\nOpen Tuesday to Sunday.');
  assertEquals(text.includes('shortened'), false);
});

Deno.test('an oversized source is trimmed and the trim is announced', () => {
  const huge = 'word '.repeat(3000); // 15k chars, well over the per-source cap
  const text = buildKnowledgeText([{ title: 'Handbook', content_text: huge }]);

  assertEquals(text.length < 5000, true);
  assertStringIncludes(text, '### Handbook');
  // The model must be able to tell "trimmed" from "not offered", or it will
  // confidently deny a service that was merely cut off.
  assertStringIncludes(text, 'Do not assume anything missing here is unavailable');
});

Deno.test('the total budget holds across many large sources', () => {
  const sources = Array.from({ length: 8 }, (_, i) => ({
    title: `Doc ${i}`,
    content_text: 'x'.repeat(4000),
  }));
  const text = buildKnowledgeText(sources);

  // 8 x 4000 would be 32k characters unbounded. The total cap is what stops
  // the context window being blown, not the per-source cap.
  assertEquals(text.length < 13000, true);
  assertStringIncludes(text, 'not included because the knowledge base is too large');
});

Deno.test('trimming happens on a word boundary, never mid-word', () => {
  const text = buildKnowledgeText([
    { title: 'T', content_text: 'alpha bravo charlie '.repeat(500) },
  ]);
  const body = text.split('\n')[1];
  assertEquals(/\s$|[a-z]$/.test(body), true);
  // No half-word left dangling at the cut.
  assertEquals(body.endsWith('cha') || body.endsWith('brav'), false);
});

Deno.test('empty and whitespace-only sources are still ignored', () => {
  assertEquals(buildKnowledgeText([]), '');
  assertEquals(buildKnowledgeText([{ title: 'Blank', content_text: '   ' }]), '');
  assertEquals(buildKnowledgeText([{ title: 'Null', content_text: null }]), '');
});


// ── Rule 12 / markdown flattening ────────────────────────────────────────────
// A real ad lead was shown "[Discovery Call](https://calendly.com/...)" with the
// brackets intact, because Instagram renders plain text and the model writes
// markdown by default.

Deno.test('a markdown link becomes label plus bare URL', () => {
  assertEquals(
    flattenMarkdownLinks('Book here: [Discovery Call](https://calendly.com/x/y).'),
    'Book here: Discovery Call: https://calendly.com/x/y.',
  );
});

Deno.test('a label that is just the URL again collapses to the URL', () => {
  assertEquals(
    flattenMarkdownLinks('[https://calendly.com/x](https://calendly.com/x)'),
    'https://calendly.com/x',
  );
  // The live bot produced exactly this shape, scheme-less label included.
  assertEquals(
    flattenMarkdownLinks('[ai.wolfpackmediapr.com](https://ai.wolfpackmediapr.com)'),
    'https://ai.wolfpackmediapr.com',
  );
});

Deno.test('several links in one reply are all flattened', () => {
  assertEquals(
    flattenMarkdownLinks('See [A](https://a.com) and [B](https://b.com)'),
    'See A: https://a.com and B: https://b.com',
  );
});

Deno.test('text without markdown links is returned untouched', () => {
  // Same discipline as stripHumanReplyMarker: a no-op must be a true no-op,
  // including for multi-line replies and bare URLs.
  const plain = 'Hello!\n\nBook here: https://calendly.com/x\n- Web\n- Apps';
  assertEquals(flattenMarkdownLinks(plain), plain);
  assertEquals(flattenMarkdownLinks(''), '');
});

Deno.test('brackets that are not a link survive', () => {
  const attachment = '[Shared an Instagram reel] Ready to revolutionize?';
  assertEquals(flattenMarkdownLinks(attachment), attachment);
  assertEquals(flattenMarkdownLinks('[Sent a photo]'), '[Sent a photo]');
});

Deno.test('rule 12 tells the model these channels are plain text', () => {
  const prompt = buildWpmSystemPrompt(context);
  assertStringIncludes(prompt, 'PLAIN TEXT only');
  assertStringIncludes(prompt, 'do not render markdown');
});
