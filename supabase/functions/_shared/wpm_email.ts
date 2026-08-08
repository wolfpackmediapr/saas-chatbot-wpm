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
