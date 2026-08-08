/**
 * Launch checklist.
 *
 * Every step is derived from what is actually in the database. The previous
 * version stored ticks in localStorage, which meant progress was per-browser,
 * survived nothing, and verified nothing — you could mark "Meta webhook
 * subscription active" with no channel connected and the page would report
 * "Ready for client launch".
 *
 * Each item therefore owns its own completion rule and its own summary of the
 * evidence, so the checklist and the readiness numbers can never disagree.
 */

export type LaunchChecklistStage = 'setup' | 'channel' | 'ai' | 'validation' | 'automation';

/** Counts gathered from the client's own rows. See fetchLaunchEvidence. */
export interface LaunchEvidence {
  clientName: string | null;
  activeChannels: number;
  webhookSubscribedChannels: number;
  activeBotProfiles: number;
  activeInstructions: number;
  readyKnowledge: number;
  liveConversations: number;
  aiReplies: number;
  activeIntegrations: number;
}

export const EMPTY_EVIDENCE: LaunchEvidence = {
  clientName: null,
  activeChannels: 0,
  webhookSubscribedChannels: 0,
  activeBotProfiles: 0,
  activeInstructions: 0,
  readyKnowledge: 0,
  liveConversations: 0,
  aiReplies: 0,
  activeIntegrations: 0,
};

export interface LaunchChecklistItem {
  key: string;
  title: string;
  /** What the step gets you, in the customer's terms. */
  description: string;
  stage: LaunchChecklistStage;
  required: boolean;
  /** Where to go to complete it. */
  route: string | null;
  routeLabel: string;
  isComplete: (evidence: LaunchEvidence) => boolean;
  /** One line of evidence, shown whether or not the step passed. */
  detail: (evidence: LaunchEvidence) => string;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function buildLaunchChecklist(): LaunchChecklistItem[] {
  return [
    {
      key: 'client-profile',
      title: 'Business profile created',
      description:
        'Your agents introduce themselves with this. Without it they have nothing to say about who you are.',
      stage: 'setup',
      required: true,
      route: '/dashboard/business-profile',
      routeLabel: 'Edit business profile',
      isComplete: (e) => e.clientName !== null,
      detail: (e) => (e.clientName ? `Set up as “${e.clientName}”` : 'No business profile yet'),
    },
    {
      key: 'channel-mapping',
      title: 'Instagram or Facebook connected',
      description: 'Connect the account your customers already message you on.',
      stage: 'channel',
      required: true,
      route: '/dashboard/channel-connections',
      routeLabel: 'Connect a channel',
      isComplete: (e) => e.activeChannels > 0,
      detail: (e) =>
        e.activeChannels > 0
          ? `${plural(e.activeChannels, 'channel')} connected`
          : 'No channels connected yet',
    },
    {
      key: 'meta-webhook',
      title: 'Meta is delivering messages',
      description:
        'Meta has to be subscribed to your page before it will send us a single DM. This is set automatically when you connect.',
      stage: 'channel',
      required: true,
      route: '/dashboard/channel-connections',
      routeLabel: 'Check connections',
      isComplete: (e) => e.webhookSubscribedChannels > 0,
      detail: (e) =>
        e.webhookSubscribedChannels > 0
          ? `${plural(e.webhookSubscribedChannels, 'channel')} subscribed to message delivery`
          : e.activeChannels > 0
            ? 'Connected, but Meta has not confirmed message delivery — try reconnecting'
            : 'Connect a channel first',
    },
    {
      key: 'bot-instructions',
      title: 'Agent set up',
      description: 'Your agent’s tone, goal, qualifying questions and handoff rules.',
      stage: 'ai',
      required: true,
      route: '/dashboard/agent-setup',
      routeLabel: 'Set up your agent',
      isComplete: (e) => e.activeBotProfiles > 0 && e.activeInstructions > 0,
      detail: (e) => {
        if (e.activeBotProfiles === 0) return 'No agent created yet';
        if (e.activeInstructions === 0) return 'Agent exists but has no active instructions';
        return `${plural(e.activeBotProfiles, 'agent')}, ${plural(e.activeInstructions, 'instruction set')}`;
      },
    },
    {
      key: 'knowledge-base',
      title: 'Knowledge added',
      description:
        'Your services, pricing and FAQs. Your agent answers only from what it knows, so this is what stops it saying “let me check on that”.',
      stage: 'ai',
      required: true,
      route: '/dashboard/knowledge-base',
      routeLabel: 'Add knowledge',
      isComplete: (e) => e.readyKnowledge > 0,
      detail: (e) =>
        e.readyKnowledge > 0
          ? `${plural(e.readyKnowledge, 'source')} ready`
          : 'No knowledge marked ready — your agent has nothing to answer from',
    },
    {
      key: 'live-smoke-test',
      title: 'Tested with a real message',
      description:
        'Send yourself a DM on the connected account and confirm the agent replies. This proves the whole loop end to end.',
      stage: 'validation',
      required: true,
      route: '/dashboard/inbox',
      routeLabel: 'Open Inbox',
      isComplete: (e) => e.liveConversations > 0 && e.aiReplies > 0,
      detail: (e) => {
        if (e.liveConversations === 0) return 'No conversations on a connected channel yet';
        if (e.aiReplies === 0) return 'Messages received, but the agent has not replied yet';
        return `${plural(e.liveConversations, 'conversation')}, ${plural(e.aiReplies, 'agent reply', 'agent replies')} sent`;
      },
    },
    {
      key: 'lead-routing',
      title: 'Lead delivery connected',
      description:
        'Send qualified leads to your CRM, inbox or Zapier. Optional — leads are always saved to the Leads page either way.',
      stage: 'automation',
      required: false,
      route: '/dashboard/automations',
      routeLabel: 'Set up delivery',
      isComplete: (e) => e.activeIntegrations > 0,
      detail: (e) =>
        e.activeIntegrations > 0
          ? `${plural(e.activeIntegrations, 'integration')} active`
          : 'Not set up — leads still appear on the Leads page',
    },
  ];
}

export interface LaunchChecklistSummary {
  total: number;
  completed: number;
  percentComplete: number;
  requiredBlockers: LaunchChecklistItem[];
  launchReady: boolean;
}

export function summarizeLaunchChecklist(
  items: LaunchChecklistItem[],
  evidence: LaunchEvidence,
): LaunchChecklistSummary {
  const completed = items.filter((item) => item.isComplete(evidence)).length;
  const requiredBlockers = items.filter((item) => item.required && !item.isComplete(evidence));

  return {
    total: items.length,
    completed,
    percentComplete: items.length === 0 ? 0 : Math.round((completed / items.length) * 100),
    requiredBlockers,
    launchReady: requiredBlockers.length === 0,
  };
}

/** The first required step that is not done, falling back to optional ones. */
export function getNextLaunchAction(
  items: LaunchChecklistItem[],
  evidence: LaunchEvidence,
): LaunchChecklistItem | null {
  const incomplete = items.filter((item) => !item.isComplete(evidence));
  return incomplete.find((item) => item.required) ?? incomplete[0] ?? null;
}
