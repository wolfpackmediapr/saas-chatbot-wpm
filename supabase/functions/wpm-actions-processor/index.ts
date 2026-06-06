import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-action-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface ToolExecution {
  id: string;
  client_id: string;
  conversation_id: string;
  integration_id: string;
  tool_name: string;
  input_payload: {
    lead_id?: string;
    integration_name?: string;
    provider?: string;
    integration_type?: string;
    field_map?: { fields?: string[] };
    lead?: Record<string, unknown>;
    webhook_url?: string | null;
    email?: string | null;
  };
  status: string;
}

interface IntegrationRow {
  id: string;
  metadata: {
    webhook_url?: string | null;
    email?: string | null;
    [key: string]: unknown;
  };
  field_map: { fields?: string[] };
  integration_type: string;
  name: string;
}

async function sendWebhook(url: string, payload: unknown, fetcher = fetch) {
  const res = await fetcher(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, body };
}

async function sendEmailViaResend(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    return { ok: false, simulated: true, error: 'No RESEND_API_KEY configured' };
  }

  const from = Deno.env.get('RESEND_FROM') || 'WolfPack AI <wilfre@wolfpackmediapr.com>';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });

    const data = await res.json();
    return {
      ok: res.ok,
      simulated: false,
      status: res.status,
      messageId: data?.id || null,
      response: data,
    };
  } catch (err) {
    return { ok: false, simulated: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function buildEmailContent(lead: Record<string, unknown>, mapped: Record<string, unknown>, integrationName?: string) {
  const name = (lead.fullName || lead.name || lead.contactName || 'New Lead') as string;
  const phone = (lead.phone || lead.whatsapp || lead.contactPhone || '') as string;
  const service = (lead.serviceInterest || lead.interest || lead.service || '') as string;
  const source = (lead.source || lead.channel || 'DM') as string;

  const subject = `New qualified lead: ${name}${service ? ` — ${service}` : ''} (${source})`;

  const lines: string[] = [];
  lines.push(`Name: ${name}`);
  if (phone) lines.push(`Phone / WhatsApp: ${phone}`);
  if (service) lines.push(`Interested in: ${service}`);
  if (lead.email) lines.push(`Email: ${lead.email}`);
  if (lead.location) lines.push(`Location: ${lead.location}`);
  if (lead.budget) lines.push(`Budget: ${lead.budget}`);
  if (lead.timeline) lines.push(`Timeline: ${lead.timeline}`);
  if (lead.notes) lines.push(`Notes: ${lead.notes}`);

  const textBody = [
    `Qualified lead from ${integrationName || 'WPM AI Agent'}`,
    '',
    ...lines,
    '',
    'Full lead data (for your system):',
    JSON.stringify(lead, null, 2),
  ].join('\n');

  const htmlBody = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #111;">New Qualified Lead</h2>
      <p><strong>Source:</strong> ${source} via WPM AI DM Agent</p>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr><td style="padding: 6px 0; border-bottom: 1px solid #eee; font-weight: 600;">Name</td><td style="padding: 6px 0; border-bottom: 1px solid #eee;">${name}</td></tr>
        ${phone ? `<tr><td style="padding: 6px 0; border-bottom: 1px solid #eee; font-weight: 600;">Phone/WhatsApp</td><td style="padding: 6px 0; border-bottom: 1px solid #eee;">${phone}</td></tr>` : ''}
        ${service ? `<tr><td style="padding: 6px 0; border-bottom: 1px solid #eee; font-weight: 600;">Service Interest</td><td style="padding: 6px 0; border-bottom: 1px solid #eee;">${service}</td></tr>` : ''}
        ${lead.email ? `<tr><td style="padding: 6px 0; border-bottom: 1px solid #eee; font-weight: 600;">Email</td><td style="padding: 6px 0; border-bottom: 1px solid #eee;">${lead.email}</td></tr>` : ''}
        ${lead.location ? `<tr><td style="padding: 6px 0; border-bottom: 1px solid #eee; font-weight: 600;">Location</td><td style="padding: 6px 0; border-bottom: 1px solid #eee;">${lead.location}</td></tr>` : ''}
        ${lead.budget ? `<tr><td style="padding: 6px 0; border-bottom: 1px solid #eee; font-weight: 600;">Budget</td><td style="padding: 6px 0; border-bottom: 1px solid #eee;">${lead.budget}</td></tr>` : ''}
        ${lead.timeline ? `<tr><td style="padding: 6px 0; border-bottom: 1px solid #eee; font-weight: 600;">Timeline</td><td style="padding: 6px 0; border-bottom: 1px solid #eee;">${lead.timeline}</td></tr>` : ''}
      </table>
      ${lead.notes ? `<p><strong>Notes:</strong> ${lead.notes}</p>` : ''}
      <details style="margin-top: 20px;">
        <summary style="cursor: pointer; color: #555;">View full lead payload (for CRM/Zapier)</summary>
        <pre style="background:#f8f8f8;padding:12px;border-radius:6px;font-size:12px;overflow:auto;">${JSON.stringify(lead, null, 2)}</pre>
      </details>
      <p style="color:#888;font-size:12px;margin-top:24px;">Sent by WolfPack Media AI DM Agent • ${new Date().toISOString()}</p>
    </div>
  `;

  return { subject, text: textBody, html: htmlBody };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const secret = Deno.env.get('WPM_ACTION_PROCESSOR_SECRET');
  const providedSecret = req.headers.get('x-action-secret') || new URL(req.url).searchParams.get('secret');

  if (!secret || providedSecret !== secret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Missing Supabase env' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: pending, error } = await supabase
    .from('wpm_tool_executions')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(20) as { data: ToolExecution[] | null; error: any };

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const results: Array<{ id: string; status: string; note?: string; response?: unknown }> = [];

  for (const exec of pending ?? []) {
    try {
      const input = exec.input_payload || {};
      const lead = input.lead || {};
      const fieldMap = input.field_map?.fields || [];

      // Build mapped payload based on field_map
      const mapped: Record<string, unknown> = {};
      for (const f of fieldMap) {
        if (lead[f] !== undefined) mapped[f] = lead[f];
      }
      // Always include full lead for flexibility
      mapped.lead = lead;
      mapped.lead_id = input.lead_id;
      mapped.conversation_id = exec.conversation_id;

      let deliveryResult: any = { note: 'No delivery configured' };

      const integrationType = input.integration_type || '';
      const integrationName = input.integration_name || 'Automation';
      const isWebhook = integrationType === 'zapier_webhook' || integrationType === 'custom_webhook';

      if (isWebhook) {
        // Prefer url from input_payload (enriched at queue time), else fetch integration
        let webhookUrl = input.webhook_url;

        if (!webhookUrl) {
          const { data: intRow } = await supabase
            .from('wpm_integrations')
            .select('metadata')
            .eq('id', exec.integration_id)
            .maybeSingle() as { data: IntegrationRow | null };

          webhookUrl = intRow?.metadata?.webhook_url || null;
        }

        if (webhookUrl) {
          const sendRes = await sendWebhook(webhookUrl, mapped);
          deliveryResult = {
            type: 'webhook',
            url: webhookUrl,
            status: sendRes.status,
            response: sendRes.body,
            success: sendRes.ok,
          };
        } else {
          deliveryResult = { type: 'webhook', error: 'No webhook_url found' };
        }
      } else if (integrationType === 'email') {
        const toEmail = input.email;

        if (toEmail) {
          const { subject, text, html } = buildEmailContent(lead, mapped, integrationName);
          const emailRes = await sendEmailViaResend({ to: toEmail, subject, html, text });

          deliveryResult = {
            type: 'email',
            to: toEmail,
            subject,
            simulated: emailRes.simulated ?? true,
            success: emailRes.ok,
            messageId: emailRes.messageId || null,
            payload: mapped,
            note: emailRes.simulated
              ? 'Simulated email (no RESEND_API_KEY). Full email content prepared.'
              : 'Email sent via Resend',
            response: emailRes,
          };
        } else {
          deliveryResult = { type: 'email', error: 'No email address in payload or integration' };
        }
      }

      const finalStatus = deliveryResult.success === false ? 'failed' : 'completed';

      const { error: updateError } = await supabase
        .from('wpm_tool_executions')
        .update({
          status: finalStatus,
          output_payload: {
            processed_at: new Date().toISOString(),
            delivery: deliveryResult,
            mapped_payload: mapped,
          },
        })
        .eq('id', exec.id);

      results.push({
        id: exec.id,
        status: updateError ? 'failed' : finalStatus,
        note: updateError ? updateError.message : deliveryResult.note,
        response: deliveryResult,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabase
        .from('wpm_tool_executions')
        .update({
          status: 'failed',
          output_payload: { processed_at: new Date().toISOString(), error: msg },
        })
        .eq('id', exec.id);

      results.push({ id: exec.id, status: 'failed', note: msg });
    }
  }

  return jsonResponse({
    ok: true,
    processed: results.length,
    results,
  });
});
