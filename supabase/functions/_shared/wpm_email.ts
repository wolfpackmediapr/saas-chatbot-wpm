/**
 * Transactional email for the moments nobody is watching the dashboard.
 *
 * Toasts and browser notifications both need the app open. An escalation at
 * 2am with nobody logged in is the case that actually loses a customer, so it
 * goes out by email too.
 *
 * Sending is best-effort by design: a mail failure must never break the reply
 * pipeline, and a missing API key is a normal, quiet no-op rather than an error.
 */

interface SupabaseLike {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
  auth?: {
    admin?: {
      getUserById(id: string): Promise<{
        data: { user: { email?: string | null } | null };
        error: unknown;
      }>;
    };
  };
}

export interface EmailResult {
  sent: boolean;
  reason?: string;
}

const DASHBOARD_URL = 'https://ai.wolfpackmediapr.com/dashboard/inbox';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Who to notify, most specific first:
 *   1. the agent's own handoff contact
 *   2. the business contact address
 *   3. the address the account was created with
 *
 * The third exists so escalation email works with zero configuration.
 */
export async function resolveHandoffRecipient(
  supabase: SupabaseLike,
  clientId: string,
  botProfileId: string | null,
): Promise<string | null> {
  try {
    if (botProfileId) {
      const { data: profile } = await supabase
        .from('wpm_bot_profiles')
        .select('handoff_contact')
        .eq('id', botProfileId)
        .maybeSingle();
      const contact = (profile as { handoff_contact?: string | null } | null)?.handoff_contact;
      if (contact?.includes('@')) return contact.trim();
    }

    const { data: client } = await supabase
      .from('wpm_clients')
      .select('contact_email, owner_user_id')
      .eq('id', clientId)
      .maybeSingle();

    const clientRow = client as
      | { contact_email?: string | null; owner_user_id?: string | null }
      | null;

    if (clientRow?.contact_email?.includes('@')) return clientRow.contact_email.trim();

    // Final fallback: the address the account was created with. Without this a
    // customer who configures neither field gets no escalation email at all —
    // which fails exactly the people least likely to have configured anything.
    if (clientRow?.owner_user_id && supabase.auth?.admin) {
      const { data, error } = await supabase.auth.admin.getUserById(clientRow.owner_user_id);
      if (!error && data?.user?.email?.includes('@')) return data.user.email.trim();
    }

    return null;
  } catch (err) {
    console.error('[email] recipient lookup failed:', err);
    return null;
  }
}

async function sendViaResend(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<EmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return { sent: false, reason: 'RESEND_API_KEY not set' };

  const from = Deno.env.get('RESEND_FROM') ?? 'WolfPack AI <onboarding@resend.dev>';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [args.to], subject: args.subject, html: args.html }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[email] Resend returned ${response.status}: ${body}`);
      return { sent: false, reason: `Resend ${response.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error('[email] send failed:', err);
    return { sent: false, reason: String(err) };
  }
}

export async function sendEscalationEmail(
  supabase: SupabaseLike,
  args: {
    clientId: string;
    botProfileId: string | null;
    reason: string;
    priority: 'normal' | 'urgent';
    channelLabel: string;
    customerName: string | null;
    lastMessage: string | null;
  },
): Promise<EmailResult> {
  const to = await resolveHandoffRecipient(supabase, args.clientId, args.botProfileId);
  if (!to) return { sent: false, reason: 'no handoff contact, business email, or account email' };

  const who = args.customerName?.trim() || 'A customer';
  const urgent = args.priority === 'urgent';
  const subject = urgent
    ? `Urgent: ${who} needs a person on ${args.channelLabel}`
    : `${who} is waiting for a person on ${args.channelLabel}`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;color:#10191b">
      <p style="font-size:15px;margin:0 0 16px">
        ${escapeHtml(who)} asked for a person on <strong>${escapeHtml(args.channelLabel)}</strong>.
      </p>
      <p style="font-size:14px;color:#45585b;margin:0 0 16px">
        <strong>Why:</strong> ${escapeHtml(args.reason)}
      </p>
      ${
        args.lastMessage
          ? `<blockquote style="margin:0 0 20px;padding:12px 14px;background:#f2f6f6;border-left:3px solid #0e8f9e;font-size:14px">
               ${escapeHtml(args.lastMessage.slice(0, 400))}
             </blockquote>`
          : ''
      }
      <p style="font-size:14px;color:#45585b;margin:0 0 20px">
        Your agent keeps replying until you send a message, so nobody is being left in silence —
        but it will not close the deal for you.
      </p>
      <a href="${DASHBOARD_URL}"
         style="display:inline-block;background:#0e8f9e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600">
        Open the conversation
      </a>
    </div>
  `;

  return sendViaResend({ to, subject, html });
}

/**
 * Confirms an account deletion to the address that owned it.
 *
 * The published page at wolfpackmediapr.com/data-deletion promises a
 * confirmation email "once deletion is complete". Before this existed, the
 * email route honoured that by hand while the in-app button honoured nothing —
 * the page made a promise the product did not keep, which is the exact defect
 * the deletion work was undertaken to fix.
 *
 * It doubles as a security notice: if someone else deleted the account, this is
 * the only signal the real owner would ever get. That is also why it is sent
 * after the deletion rather than before — it reports what happened, and the
 * address is held in memory since the identity row is already gone.
 *
 * Best-effort. The account is already deleted by the time this runs, so a
 * failure here is logged and never fails the request.
 */
export async function sendAccountDeletionConfirmation(to: string): Promise<EmailResult> {
  if (!to) return { sent: false, reason: 'no address' };

  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px">
      <h2 style="margin:0 0 12px;font-size:18px">Your account has been deleted</h2>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6">
        Your WolfPack Media Chat account for <strong>${escapeHtml(to)}</strong> has been
        permanently deleted, along with your business profile, agent settings,
        conversations, messages, saved leads, knowledge base, and connected
        Facebook and Instagram access tokens.
      </p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6">
        Any active subscription has been cancelled, so you will not be billed again.
        Billing and tax records are retained for 7 years as required by law.
      </p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#666">
        If you did not request this, reply to this email immediately — this is the
        only notice you will receive.
      </p>
    </div>
  `;

  return sendViaResend({
    to,
    subject: 'Your WolfPack Media Chat account has been deleted',
    html,
  });
}

const BILLING_URL = 'https://ai.wolfpackmediapr.com/dashboard/settings?tab=billing';

/**
 * The two trial emails.
 *
 * Added 2026-09-07. Trial expiry was the one moment the product never told
 * anyone about. Everything else that matters — an escalation, a qualified lead —
 * sends mail; the trial simply ran out, the agent went quiet, and the only place
 * that said so was a banner inside an app the customer had stopped opening.
 * In House Chef's trial ends 2026-09-09 with 969 of 1,000 messages unused, so
 * the number that would have run out first is the calendar, silently.
 *
 * ⚠️ These go to the ACCOUNT OWNER, not through `resolveHandoffRecipient`. That
 * chain deliberately prefers the agent's `handoff_contact`, which is whoever
 * handles customers — often not the person who can enter a card. Billing mail
 * follows the account, not the inbox.
 *
 * The copy deliberately mirrors `TrialBar.tsx` word for word on what stops and
 * what does not. An email that describes a different product from the banner is
 * how a customer decides neither can be trusted.
 */
/**
 * Button teal, darkened from the #0e8f9e used elsewhere in this file.
 *
 * White on #0e8f9e measures 3.86:1, which fails WCAG AA — that needs 4.5:1 for
 * 14px bold, since bold text only counts as "large" from 18.66px. #0b7a86 is
 * 5.07:1 and is a shade most people cannot tell apart. This is the same
 * white-on-primary problem recorded against the app's own primary colour; it
 * matters more here because this is the button asking someone to start paying.
 */
const BUTTON_BG = '#0b7a86';

function trialEmailHtml(args: {
  heading: string;
  lead: string;
  /**
   * What stops. Written per-template rather than shared: the warning needs a
   * future tense ("when it ends...") or it contradicts the sentence above it,
   * and the expired mail must not repeat a fact its own opening line just gave.
   */
  consequence: string;
  cta: string;
  closing?: string;
}): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;color:#10191b">
      <h2 style="margin:0 0 14px;font-size:19px">${args.heading}</h2>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${args.lead}</p>
      <p style="font-size:14px;line-height:1.6;color:#45585b;margin:0 0 20px">
        ${args.consequence}
        Messages still arrive in your Inbox, and your agent setup, knowledge base
        and connected accounts are all kept exactly as they are.
      </p>
      <a href="${BILLING_URL}"
         style="display:inline-block;background:${BUTTON_BG};color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;font-size:14px;font-weight:600">
        ${args.cta}
      </a>
      ${
    args.closing
      ? `<p style="font-size:14px;line-height:1.6;color:#45585b;margin:20px 0 0">${args.closing}</p>`
      : ''
  }
      <p style="font-size:12px;color:#8a9a9c;margin:24px 0 0">
        You are getting this because your WolfPack AI free trial is ending.
        This is a one-time notice, not a subscription.
      </p>
    </div>
  `;
}

/**
 * Sent once, roughly 24 hours before the 7-day clock runs out.
 *
 * `messagesUsed` is included only when the customer has actually used the
 * product. Telling someone who sent 31 of 1,000 messages that they have "969
 * remaining" reads as a reason to ignore the email, when the calendar — not the
 * grant — is what is about to end.
 */
export async function sendTrialExpiringSoonEmail(
  to: string,
  args: { businessName?: string | null; endsAt: Date },
): Promise<EmailResult> {
  if (!to?.includes('@')) return { sent: false, reason: 'no address' };

  const who = args.businessName?.trim();
  const lead = `Your 7-day free trial${who ? ` for <strong>${escapeHtml(who)}</strong>` : ''} ends tomorrow. ` +
    `Add a plan before then and nothing changes — your agent keeps answering without a gap.`;

  return sendViaResend({
    to,
    subject: 'Your WolfPack AI free trial ends tomorrow',
    html: trialEmailHtml({
      heading: 'Your free trial ends tomorrow',
      lead,
      // Future tense. "Your agent stops replying" here reads as though it
      // already had, contradicting the line directly above it.
      consequence: 'When it ends, your agent stops replying and new leads are no longer captured.',
      cta: 'Choose a plan',
      closing: 'If you have a question before deciding, just reply to this email.',
    }),
  });
}

/** Sent once, after the 7-day clock has run out. */
export async function sendTrialExpiredEmail(
  to: string,
  args: { businessName?: string | null },
): Promise<EmailResult> {
  if (!to?.includes('@')) return { sent: false, reason: 'no address' };

  const who = args.businessName?.trim();
  const lead = `Your 7-day free trial${who ? ` for <strong>${escapeHtml(who)}</strong>` : ''} has ended, ` +
    `so your agent has stopped replying to new messages. Choosing a plan turns it back on straight away.`;

  return sendViaResend({
    to,
    subject: 'Your WolfPack AI free trial has ended',
    html: trialEmailHtml({
      heading: 'Your free trial has ended',
      lead,
      // The opening line already said the agent has stopped. Saying it again
      // here, in the present tense, told the reader the same fact twice.
      consequence: 'New leads are no longer captured either.',
      cta: 'Choose a plan',
      closing: 'Nothing has been deleted. Everything picks up where it left off.',
    }),
  });
}

/**
 * The other way a trial ends.
 *
 * Added 2026-09-07. The plan is "1,000 messages OR 7 days, whichever comes
 * first", and until now only the calendar half said anything. Someone who burns
 * the grant on day three has their agent go quiet with four days still on the
 * clock and is told nothing at all.
 *
 * ⚠️ These must NOT say "your trial has ended". It has not — the message
 * allowance has. Telling someone with four days left that their trial is over is
 * false, and it invites the reply "no it isn't". The distinction is the whole
 * reason these are separate templates rather than a reworded expiry notice.
 */
function grantLine(used: number, limit: number): string {
  return `You have used <strong>${used.toLocaleString()}</strong> of your ` +
    `<strong>${limit.toLocaleString()}</strong> free messages.`;
}

/**
 * Sent once, when the grant is nearly gone but the calendar has not run out.
 *
 * Fires at 90%, which on the standard grant leaves 100 messages of runway —
 * enough for the agent to keep working through a decision rather than stopping
 * mid-conversation the moment the mail lands.
 */
export async function sendTrialGrantLowEmail(
  to: string,
  args: { businessName?: string | null; messagesUsed: number; messagesLimit: number },
): Promise<EmailResult> {
  if (!to?.includes('@')) return { sent: false, reason: 'no address' };

  const who = args.businessName?.trim();
  const remaining = Math.max(args.messagesLimit - args.messagesUsed, 0);
  const lead = `${grantLine(args.messagesUsed, args.messagesLimit)} ` +
    `That leaves about <strong>${remaining.toLocaleString()}</strong> before your agent` +
    `${who ? ` for ${escapeHtml(who)}` : ''} stops replying — and your free days have not run out, ` +
    `so this is the allowance rather than the clock.`;

  return sendViaResend({
    to,
    subject: 'You are almost out of free messages',
    html: trialEmailHtml({
      heading: 'You are almost out of free messages',
      lead,
      consequence: 'When they run out, your agent stops replying and new leads are no longer captured.',
      cta: 'Choose a plan',
      closing: 'Adding a plan now means your agent never pauses.',
    }),
  });
}

/** Sent once, when the grant is spent while calendar days remain. */
export async function sendTrialGrantExhaustedEmail(
  to: string,
  args: { businessName?: string | null; messagesUsed: number; messagesLimit: number },
): Promise<EmailResult> {
  if (!to?.includes('@')) return { sent: false, reason: 'no address' };

  const who = args.businessName?.trim();
  const lead = `${grantLine(args.messagesUsed, args.messagesLimit)} ` +
    `Your agent${who ? ` for <strong>${escapeHtml(who)}</strong>` : ''} has stopped replying to new messages. ` +
    `Your free days have not run out — it is the message allowance that has, and choosing a plan ` +
    `turns the agent back on straight away.`;

  return sendViaResend({
    to,
    subject: 'You have used all your free messages',
    html: trialEmailHtml({
      heading: 'You have used all your free messages',
      lead,
      consequence: 'New leads are no longer captured either.',
      cta: 'Choose a plan',
      closing: 'Nothing has been deleted. Everything picks up where it left off.',
    }),
  });
}

/**
 * Tells the business a qualified lead just came in.
 *
 * Deliberately NOT an integration you have to switch on. Before this existed,
 * a captured lead was silent until the owner happened to open the dashboard or
 * had wired up a Zapier hook — so the one event the product exists to produce
 * was the one event nobody was told about. It now behaves like the escalation
 * email: on from the first signup, using the same recipient chain, and opt-out
 * rather than opt-in.
 *
 * Best-effort, like everything else here. A mail failure must never affect the
 * lead itself, which is already safely stored by the time this runs.
 */
export async function sendQualifiedLeadEmail(
  supabase: SupabaseLike,
  args: {
    clientId: string;
    botProfileId: string | null;
    overrideTo?: string | null;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    intent: string | null;
    serviceInterest: string | null;
    channelLabel: string;
  },
): Promise<EmailResult> {
  const to = args.overrideTo?.trim()
    || await resolveHandoffRecipient(supabase, args.clientId, args.botProfileId);
  if (!to) return { sent: false, reason: 'no handoff contact, business email, or account email' };

  // The extractor does not always get a name, and a subject reading
  // "New lead: " with nothing after it looks broken. Fall back to whatever
  // contact detail we do have, because that is what you would act on anyway.
  const who = args.fullName?.trim()
    || args.email?.trim()
    || args.phone?.trim()
    || 'Someone';

  const rows: Array<[string, string | null]> = [
    ['Email', args.email],
    ['Phone', args.phone],
    ['Interested in', args.serviceInterest],
    ['Intent', args.intent],
    ['Channel', args.channelLabel],
  ];

  const details = rows
    .filter(([, value]) => value && value.trim())
    .map(([label, value]) => `
      <tr>
        <td style="padding:6px 12px 6px 0;color:#45585b;font-size:14px;white-space:nowrap">${escapeHtml(label)}</td>
        <td style="padding:6px 0;font-size:14px;color:#10191b"><strong>${escapeHtml(String(value))}</strong></td>
      </tr>`)
    .join('');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;color:#10191b">
      <p style="font-size:15px;margin:0 0 16px">
        Your AI agent just qualified a new lead on <strong>${escapeHtml(args.channelLabel)}</strong>.
      </p>
      <table style="border-collapse:collapse;margin:0 0 20px">${details}</table>
      <a href="https://ai.wolfpackmediapr.com/dashboard/leads"
         style="display:inline-block;background:#0e8f9e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600">
        Open your leads
      </a>
      <p style="font-size:12px;color:#8a9a9c;margin:20px 0 0">
        You are getting this because a lead was captured. You can turn these off on the Leads page.
      </p>
    </div>
  `;

  return sendViaResend({ to, subject: `New lead: ${who}`, html });
}
