/// <reference lib="deno.ns" />
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildLaunchChecklist,
  summarizeLaunchChecklist,
  getNextLaunchAction,
} from '../../../src/lib/wpm/launchChecklist.ts';

Deno.test('buildLaunchChecklist creates the WPM-assisted setup path in launch order', () => {
  const items = buildLaunchChecklist();

  assertEquals(items.map((item) => item.key), [
    'client-profile',
    'agent-setup',
    'knowledge-base',
    'channel-mapping',
    'automations',
    'woztell-webhook',
    'agent-test',
    'readiness-check',
    'live-smoke-test',
    'lead-routing',
  ]);
  assertEquals(items[1].required, true);
  assertEquals(items[1].owner, 'Client');
  assertEquals(items[5].action.includes('https://upthfjkxbsqtipzoeecd.supabase.co/functions/v1/woztell-webhook'), true);
});

Deno.test('summarizeLaunchChecklist counts completed and exposes required blockers', () => {
  const items = buildLaunchChecklist();
  const summary = summarizeLaunchChecklist(items, [
    'client-profile',
    'agent-setup',
    'knowledge-base',
  ]);

  assertEquals(summary.total, 10);
  assertEquals(summary.completed, 3);
  assertEquals(summary.percentComplete, 30);
  assertEquals(summary.requiredBlockers.map((item) => item.key), [
    'channel-mapping',
    'woztell-webhook',
    'agent-test',
    'readiness-check',
    'live-smoke-test',
  ]);
  assertEquals(summary.launchReady, false);
});

Deno.test('getNextLaunchAction returns the first incomplete required item before optional routing', () => {
  const items = buildLaunchChecklist();

  assertEquals(getNextLaunchAction(items, ['client-profile'])?.key, 'agent-setup');
  assertEquals(
    getNextLaunchAction(items, [
      'client-profile',
      'agent-setup',
      'knowledge-base',
      'channel-mapping',
      'automations',
      'woztell-webhook',
      'agent-test',
      'readiness-check',
      'live-smoke-test',
    ])?.key,
    'lead-routing',
  );
});
