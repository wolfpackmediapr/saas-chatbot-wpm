/// <reference lib="deno.ns" />
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildLaunchChecklist,
  EMPTY_EVIDENCE,
  getNextLaunchAction,
  type LaunchEvidence,
  summarizeLaunchChecklist,
} from '../../../src/lib/wpm/launchChecklist.ts';

/** Evidence for a client who has finished everything, including the optional step. */
const FULLY_LAUNCHED: LaunchEvidence = {
  clientName: 'Demo Restaurant',
  activeChannels: 2,
  webhookSubscribedChannels: 2,
  activeBotProfiles: 1,
  activeInstructions: 1,
  readyKnowledge: 3,
  liveConversations: 5,
  aiReplies: 4,
  activeIntegrations: 1,
};

Deno.test('buildLaunchChecklist lists the Instagram + Facebook setup path in launch order', () => {
  const items = buildLaunchChecklist();

  assertEquals(items.map((item) => item.key), [
    'client-profile',
    'channel-mapping',
    'meta-webhook',
    'bot-instructions',
    'knowledge-base',
    'live-smoke-test',
    'lead-routing',
  ]);
});

Deno.test('every step is required except lead delivery', () => {
  const items = buildLaunchChecklist();

  assertEquals(
    items.filter((item) => !item.required).map((item) => item.key),
    ['lead-routing'],
  );
});

Deno.test('every step routes somewhere the user can act', () => {
  for (const item of buildLaunchChecklist()) {
    assertEquals(typeof item.route, 'string', `${item.key} has no route`);
    assertStringIncludes(item.route ?? '', '/dashboard/');
  }
});

// The whole point of the rewrite: nothing is ticked by hand, so an empty
// database must report zero regardless of what anyone clicked previously.
Deno.test('no evidence means nothing is complete and the client is not launch ready', () => {
  const items = buildLaunchChecklist();
  const summary = summarizeLaunchChecklist(items, EMPTY_EVIDENCE);

  assertEquals(summary.total, 7);
  assertEquals(summary.completed, 0);
  assertEquals(summary.percentComplete, 0);
  assertEquals(summary.launchReady, false);
  assertEquals(summary.requiredBlockers.length, 6);
});

Deno.test('full evidence completes every step and clears launch readiness', () => {
  const items = buildLaunchChecklist();
  const summary = summarizeLaunchChecklist(items, FULLY_LAUNCHED);

  assertEquals(summary.completed, 7);
  assertEquals(summary.percentComplete, 100);
  assertEquals(summary.requiredBlockers, []);
  assertEquals(summary.launchReady, true);
});

Deno.test('the optional step alone does not block launch', () => {
  const items = buildLaunchChecklist();
  const summary = summarizeLaunchChecklist(items, {
    ...FULLY_LAUNCHED,
    activeIntegrations: 0,
  });

  assertEquals(summary.completed, 6);
  assertEquals(summary.launchReady, true);
  assertEquals(summary.requiredBlockers, []);
});

Deno.test('partial progress reports a rounded percentage', () => {
  const items = buildLaunchChecklist();
  const summary = summarizeLaunchChecklist(items, {
    ...EMPTY_EVIDENCE,
    clientName: 'Demo Restaurant',
    activeChannels: 1,
    webhookSubscribedChannels: 1,
  });

  // 3 of 7 → 42.857…, which must round rather than truncate.
  assertEquals(summary.completed, 3);
  assertEquals(summary.percentComplete, 43);
  assertEquals(summary.requiredBlockers.map((item) => item.key), [
    'bot-instructions',
    'knowledge-base',
    'live-smoke-test',
  ]);
});

Deno.test('an agent without instructions does not count as set up', () => {
  const items = buildLaunchChecklist();
  const summary = summarizeLaunchChecklist(items, {
    ...EMPTY_EVIDENCE,
    activeBotProfiles: 1,
    activeInstructions: 0,
  });

  assertEquals(summary.completed, 0);
});

// A conversation arriving is not proof the loop works — the agent has to have
// answered. This is the check that would have caught the Facebook outage.
Deno.test('inbound messages without an agent reply fail the smoke test', () => {
  const items = buildLaunchChecklist();
  const smokeTest = items.find((item) => item.key === 'live-smoke-test')!;
  const evidence = { ...EMPTY_EVIDENCE, liveConversations: 3, aiReplies: 0 };

  assertEquals(smokeTest.isComplete(evidence), false);
  assertStringIncludes(smokeTest.detail(evidence), 'has not replied yet');
});

Deno.test('a connected channel with no Meta subscription explains itself', () => {
  const items = buildLaunchChecklist();
  const webhook = items.find((item) => item.key === 'meta-webhook')!;

  const connectedButUnsubscribed = { ...EMPTY_EVIDENCE, activeChannels: 1 };
  assertEquals(webhook.isComplete(connectedButUnsubscribed), false);
  assertStringIncludes(webhook.detail(connectedButUnsubscribed), 'try reconnecting');

  assertStringIncludes(webhook.detail(EMPTY_EVIDENCE), 'Connect a channel first');
});

Deno.test('detail lines pluralise correctly for a single item', () => {
  const items = buildLaunchChecklist();
  const channels = items.find((item) => item.key === 'channel-mapping')!;

  assertStringIncludes(channels.detail({ ...EMPTY_EVIDENCE, activeChannels: 1 }), '1 channel connected');
  assertStringIncludes(channels.detail({ ...EMPTY_EVIDENCE, activeChannels: 2 }), '2 channels connected');
});

Deno.test('getNextLaunchAction walks required steps in order before the optional one', () => {
  const items = buildLaunchChecklist();

  assertEquals(getNextLaunchAction(items, EMPTY_EVIDENCE)?.key, 'client-profile');

  assertEquals(
    getNextLaunchAction(items, { ...EMPTY_EVIDENCE, clientName: 'Demo Restaurant' })?.key,
    'channel-mapping',
  );

  // Everything required is done; only the optional step is left.
  assertEquals(
    getNextLaunchAction(items, { ...FULLY_LAUNCHED, activeIntegrations: 0 })?.key,
    'lead-routing',
  );
});

Deno.test('getNextLaunchAction returns null once nothing is left', () => {
  const items = buildLaunchChecklist();

  assertEquals(getNextLaunchAction(items, FULLY_LAUNCHED), null);
});
