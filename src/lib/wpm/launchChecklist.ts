export type LaunchChecklistOwner = 'Client' | 'System' | 'WPM fallback';
export type LaunchChecklistStage = 'setup' | 'channel' | 'ai' | 'validation' | 'automation';

export interface LaunchChecklistItem {
  key: string;
  title: string;
  description: string;
  action: string;
  owner: LaunchChecklistOwner;
  stage: LaunchChecklistStage;
  required: boolean;
}

export interface LaunchChecklistSummary {
  total: number;
  completed: number;
  percentComplete: number;
  requiredBlockers: LaunchChecklistItem[];
  launchReady: boolean;
}

const WOZTELL_WEBHOOK_URL = 'https://upthfjkxbsqtipzoeecd.supabase.co/functions/v1/woztell-webhook';

export function buildLaunchChecklist(): LaunchChecklistItem[] {
  return [
    {
      key: 'client-profile',
      title: 'Business profile created',
      description: 'Client creates their own business profile with contact, timezone, industry, language, and status.',
      action: 'Go to Business Profile in the sidebar and save your company details. This creates your wpm_clients row.',
      owner: 'Client',
      stage: 'setup',
      required: true,
    },
    {
      key: 'agent-setup',
      title: 'Agent template + instructions saved',
      description: 'Client selects a vertical template and customizes the agent name, personality, booking link, and qualification rules.',
      action: 'Complete Agent Setup. Your custom instructions will be used by the AI.',
      owner: 'Client',
      stage: 'ai',
      required: true,
    },
    {
      key: 'knowledge-base',
      title: 'Business knowledge loaded',
      description: 'Client adds FAQs, services, prices, policies, website links, and offer details the agent can answer from.',
      action: 'Add at least 3-5 high-quality knowledge sources (text, website, or FAQ) and mark them ready.',
      owner: 'Client',
      stage: 'ai',
      required: true,
    },
    {
      key: 'channel-mapping',
      title: 'Channel mapped',
      description: 'Client connects or enters the channel identifiers required to route Instagram, Facebook, WhatsApp, or web chat messages.',
      action: 'Use Channel Connections to link your Woztell channels (provider = woztell).',
      owner: 'Client',
      stage: 'channel',
      required: true,
    },
    {
      key: 'automations',
      title: 'Automations configured',
      description: 'Client sets up at least one automation (Zapier, webhook, email, etc.) for qualified leads.',
      action: 'Go to Automations and create your first integration (e.g. new lead notification).',
      owner: 'Client',
      stage: 'automation',
      required: false,
    },
    {
      key: 'woztell-webhook',
      title: 'Inbound webhook connected',
      description: 'Client follows the guided setup to point Woztell or the channel provider to the WPM Bridge endpoint.',
      action: `Set the channel action/webhook URL to ${WOZTELL_WEBHOOK_URL}.`,
      owner: 'Client',
      stage: 'channel',
      required: true,
    },
    {
      key: 'agent-test',
      title: 'Agent tested in simulator',
      description: 'Client runs several test conversations in the built-in simulator to verify reply quality, lead extraction, and automation triggers before going live.',
      action: 'Go to Test Agent in the sidebar. Run at least 2-3 realistic test messages and confirm good lead signals + automation decisions.',
      owner: 'Client',
      stage: 'validation',
      required: true,
    },
    {
      key: 'readiness-check',
      title: 'Automated readiness check passes',
      description: 'System verifies required runtime secrets and client configuration rows without exposing secret values.',
      action: 'Run the readiness check (we will wire this to real Supabase + function checks soon).',
      owner: 'System',
      stage: 'validation',
      required: true,
    },
    {
      key: 'live-smoke-test',
      title: 'Live inbound/outbound smoke test passed',
      description: 'Client sends one real Instagram/WhatsApp/Facebook message and confirms the automated reply appears.',
      action: 'After webhook is connected, send a real test message from your channel and verify the agent responds + lead is captured.',
      owner: 'Client',
      stage: 'validation',
      required: true,
    },
    {
      key: 'lead-routing',
      title: 'Lead routing and automation verified',
      description: 'Client confirms qualified lead extraction and Zapier, n8n, email, CRM, or custom-webhook routing.',
      action: 'Keep webhook URLs server-side; DB integrations should store only safe metadata.',
      owner: 'Client',
      stage: 'automation',
      required: false,
    },
  ];
}

export function summarizeLaunchChecklist(
  items: LaunchChecklistItem[],
  completedKeys: string[],
): LaunchChecklistSummary {
  const completedSet = new Set(completedKeys);
  const completed = items.filter((item) => completedSet.has(item.key)).length;
  const requiredBlockers = items.filter((item) => item.required && !completedSet.has(item.key));

  return {
    total: items.length,
    completed,
    percentComplete: items.length === 0 ? 0 : Math.round((completed / items.length) * 100),
    requiredBlockers,
    launchReady: requiredBlockers.length === 0,
  };
}

export function getNextLaunchAction(
  items: LaunchChecklistItem[],
  completedKeys: string[],
): LaunchChecklistItem | null {
  const completedSet = new Set(completedKeys);
  return items.find((item) => !completedSet.has(item.key)) ?? null;
}
