import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const slackToken = Deno.env.get('SLACK_BOT_TOKEN');
  if (!slackToken) {
    return jsonResponse({ error: 'Slack integration not configured' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  const jwt = authHeader?.replace('Bearer ', '');
  if (!jwt) {
    return jsonResponse({ error: 'No authorization token' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !user) {
    return jsonResponse({ error: 'Invalid token' }, 401);
  }

  let body: {
    name?: string;
    email?: string;
    subject?: string;
    message?: string;
    category?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const { name, email, subject, message, category } = body;
  if (!name || !email || !subject || !message || !category) {
    return jsonResponse({ error: 'Missing required fields' }, 400);
  }

  try {
    const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${slackToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: '#ai',
        text: 'New Feedback Received',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: 'New Feedback Received',
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*From:*\n${String(name).trim()}`,
              },
              {
                type: 'mrkdwn',
                text: `*Email:*\n${String(email).trim()}`,
              },
            ],
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Category:*\n${String(category).trim()}`,
              },
              {
                type: 'mrkdwn',
                text: `*Subject:*\n${String(subject).trim()}`,
              },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Message:*\n${String(message).trim()}`,
            },
          },
        ],
      }),
    });

    const data = await slackResponse.json();
    if (!data.ok) {
      throw new Error(data.error || 'Failed to send message to Slack');
    }

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Failed to send feedback' },
      502,
    );
  }
});
