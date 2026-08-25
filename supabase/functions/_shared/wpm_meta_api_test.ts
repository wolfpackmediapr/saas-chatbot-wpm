import { assertEquals, assertMatch, assertStringIncludes } from 'jsr:@std/assert';
import {
  describeSendFailure,
  extractSentMessageId,
  fetchMetaUserProfile,
  GRAPH_API_BASE,
  GRAPH_API_VERSION,
} from './wpm_meta_api.ts';

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

// ---------------------------------------------------------------------------
// fetchMetaUserProfile
// ---------------------------------------------------------------------------
//
// Every Facebook thread in the Inbox showed a raw 17-digit PSID for three
// months because this asked a Messenger PSID for `name`, which that API does
// not serve. The request never errored loudly — it just returned null. These
// tests pin the field names per platform, because getting them wrong is
// invisible at runtime.

function stubFetch(
  status: number,
  body: unknown,
  capture?: { url?: string },
): typeof fetch {
  return ((url: string | URL | Request) => {
    if (capture) capture.url = String(url);
    return Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
    );
  }) as unknown as typeof fetch;
}

Deno.test('messenger lookups ask for first_name and last_name, never name', async () => {
  const seen: { url?: string } = {};
  await fetchMetaUserProfile('1234', 'tok', 'messenger', stubFetch(200, {}, seen));

  assertMatch(seen.url ?? '', /fields=first_name%2Clast_name|fields=first_name,last_name/);
  assertEquals(/fields=name/.test(seen.url ?? ''), false);
});

Deno.test('messenger name is composed from first and last name', async () => {
  const name = await fetchMetaUserProfile(
    '1234',
    'tok',
    'messenger',
    stubFetch(200, { first_name: 'Wilfre', last_name: 'Carrasquillo' }),
  );
  assertEquals(name, 'Wilfre Carrasquillo');
});

Deno.test('messenger name survives a missing last name', async () => {
  const name = await fetchMetaUserProfile(
    '1234',
    'tok',
    'messenger',
    stubFetch(200, { first_name: 'Wilfre' }),
  );
  assertEquals(name, 'Wilfre');
});

Deno.test('instagram lookups ask for name and username', async () => {
  const seen: { url?: string } = {};
  await fetchMetaUserProfile('1234', 'tok', 'instagram', stubFetch(200, {}, seen));

  assertMatch(seen.url ?? '', /fields=name%2Cusername|fields=name,username/);
});

Deno.test('instagram prefers the @handle over the display name', async () => {
  const name = await fetchMetaUserProfile(
    '1234',
    'tok',
    'instagram',
    stubFetch(200, { name: 'Wolves Can Riot', username: 'wolvescanriot' }),
  );
  assertEquals(name, '@wolvescanriot');
});

Deno.test('instagram falls back to the display name when there is no handle', async () => {
  const name = await fetchMetaUserProfile(
    '1234',
    'tok',
    'instagram',
    stubFetch(200, { name: 'Wolves Can Riot' }),
  );
  assertEquals(name, 'Wolves Can Riot');
});

// A missing name must never stop us replying to the customer.
Deno.test('a Graph error returns null instead of throwing', async () => {
  const name = await fetchMetaUserProfile(
    '1234',
    'tok',
    'messenger',
    stubFetch(400, { error: { message: 'Unsupported get request' } }),
  );
  assertEquals(name, null);
});

Deno.test('a network failure returns null instead of throwing', async () => {
  const exploding = (() => Promise.reject(new Error('boom'))) as unknown as typeof fetch;
  assertEquals(await fetchMetaUserProfile('1234', 'tok', 'messenger', exploding), null);
});

Deno.test('an empty profile response returns null, not an empty string', async () => {
  assertEquals(
    await fetchMetaUserProfile('1234', 'tok', 'messenger', stubFetch(200, {})),
    null,
  );
});


// ── Send outcome ─────────────────────────────────────────────────────────────
// Until now no outbound row carried a message id, so nothing could tell a
// delivered reply from one Meta rejected — the Inbox showed both as sent.

Deno.test('the message id is read from an accepted send', () => {
  assertEquals(extractSentMessageId({ message_id: 'mid.abc123' }), 'mid.abc123');
  assertEquals(extractSentMessageId({ recipient_id: '123' }), null);
  assertEquals(extractSentMessageId(null), null);
  assertEquals(extractSentMessageId({ message_id: 42 }), null);
});

Deno.test('code 10 is explained as the 24-hour window, not an outage', () => {
  // The exact body Meta returned in production on 2026-08-25.
  const message = describeSendFailure({
    response: {
      error: {
        message: '(#10) This message is sent outside of allowed window.',
        type: 'OAuthException',
        code: 10,
        error_subcode: 2534022,
      },
    },
  });
  assertStringIncludes(message, '24-hour messaging window');
  assertStringIncludes(message, 'until they write again');
});

Deno.test('other Meta errors keep their own message', () => {
  assertEquals(
    describeSendFailure({ response: { error: { message: 'Invalid OAuth access token.', code: 190 } } }),
    'Invalid OAuth access token.',
  );
});

Deno.test('a thrown network error is reported as-is', () => {
  assertEquals(describeSendFailure({ error: 'TypeError: network failure' }), 'TypeError: network failure');
});
