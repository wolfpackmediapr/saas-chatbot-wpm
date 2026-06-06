export type LaunchChecklistOwner = 'WPM setup' | 'Client' | 'System';
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
      title: 'Client profile created',
      description: 'Create or confirm the WPM pilot client row with contact, timezone, status, and notes.',
      action: 'Use the WPM test seed or admin client setup before mapping any channel IDs.',
      owner: 'WPM setup',
      stage: 'setup',
      required: true,
    },
    {
      key: 'channel-mapping',
      title: 'Woztell channel mapped',
      description: 'Replace placeholder routing with the real Woztell channel._id from an inbound payload.',
      action: 'Set wpm_client_channels.provider = woztell and provider_channel_id = actual Woztell channel._id.',
      owner: 'WPM setup',
      stage: 'channel',
      required: true,
    },
    {
      key: 'bot-instructions',
      title: 'Bot profile and instructions active',
      description: 'Confirm the WPM AI receptionist profile, model, booking URL, qualification rules, and handoff rules.',
      action: 'Keep WPM-managed OpenAI credentials server-side; bot profiles are configuration, not API keys.',
      owner: 'WPM setup',
      stage: 'ai',
      required: true,
    },
    {
      key: 'knowledge-base',
      title: 'Starter knowledge loaded',
      description: 'Load WPM offer positioning, AI DM Agent package details, and the live test script.',
      action: 'Mark knowledge rows ready before live testing so the prompt has enough context to answer.',
      owner: 'WPM setup',
      stage: 'ai',
      required: true,
    },
    {
      key: 'woztell-webhook',
      title: 'Woztell webhook points to WPM bridge',
      description: 'Configure Woztell to POST inbound events to the deployed Supabase Edge Function.',
      action: `Set the Woztell action/webhook URL to ${WOZTELL_WEBHOOK_URL}.`,
      owner: 'WPM setup',
      stage: 'channel',
      required: true,
    },
    {
      key: 'readiness-check',
      title: 'Bridge readiness check passes',
      description: 'Verify required runtime secrets and WPM configuration rows are present without exposing secret values.',
      action: 'Deploy/run wpm-bridge-readiness with x-wpm-action-secret and confirm no missing required checks.',
      owner: 'System',
      stage: 'validation',
      required: true,
    },
    {
      key: 'live-smoke-test',
      title: 'Live inbound/outbound smoke test passed',
      description: 'Send one real Instagram/WhatsApp/Facebook message through Woztell and confirm a BotAPI reply appears.',
      action: 'Use the WPM test message with name, service interest, email, and channel; inspect webhook events after.',
      owner: 'Client',
      stage: 'validation',
      required: true,
    },
    {
      key: 'lead-routing',
      title: 'Lead routing and automation verified',
      description: 'Confirm qualified lead extraction and any Zapier/custom-webhook routing for notifications or CRM writes.',
      action: 'Keep webhook URLs in Supabase secrets; DB integrations should store only secret_reference.',
      owner: 'WPM setup',
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
