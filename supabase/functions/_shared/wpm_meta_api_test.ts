import { assertEquals, assertMatch } from 'jsr:@std/assert';
import { GRAPH_API_BASE, GRAPH_API_VERSION } from './wpm_meta_api.ts';

Deno.test('GRAPH_API_VERSION is a well-formed Graph API version', () => {
  assertMatch(GRAPH_API_VERSION, /^v\d+\.\d+$/);
});

Deno.test('GRAPH_API_BASE composes into a usable endpoint URL', () => {
  assertEquals(GRAPH_API_BASE, `https://graph.facebook.com/${GRAPH_API_VERSION}`);
  assertEquals(
    `${GRAPH_API_BASE}/me/messages`,
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages`,
  );
});

Deno.test('GRAPH_API_BASE has no trailing slash, so callers can always prefix one', () => {
  assertEquals(GRAPH_API_BASE.endsWith('/'), false);
});

// Meta retires a version two years after release. v20.0 is retired on
// 2026-09-24 and was still wired into eleven call sites weeks beforehand; this
// test is the tripwire that stops the codebase drifting back onto a dead one.
Deno.test('GRAPH_API_VERSION is not a version Meta has retired', () => {
  const retired = ['v20.0', 'v19.0', 'v18.0', 'v17.0', 'v16.0', 'v15.0'];
  assertEquals(
    retired.includes(GRAPH_API_VERSION),
    false,
    `${GRAPH_API_VERSION} is past end of life — bump it`,
  );
});
