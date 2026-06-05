import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildWoztellTextSendPayload,
  sendWoztellTextResponse,
} from './woztell_botapi.ts';

Deno.test('buildWoztellTextSendPayload builds documented BotAPI text response body', () => {
  assertEquals(buildWoztellTextSendPayload({
    channelId: 'woztell-channel-123',
    memberId: 'woztell-member-456',
    recipientId: 'psid-or-phone-456',
    text: 'Hello World',
  }), {
    channelId: 'woztell-channel-123',
    memberId: 'woztell-member-456',
    recipientId: 'psid-or-phone-456',
    response: [
      { type: 'TEXT', text: 'Hello World' },
    ],
  });
});

Deno.test('sendWoztellTextResponse posts to BotAPI with bearer token and no token in URL', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];

  const result = await sendWoztellTextResponse({
    accessToken: 'secret-token',
    channelId: 'woztell-channel-123',
    memberId: 'woztell-member-456',
    recipientId: 'psid-or-phone-456',
    text: 'AI reply',
    fetcher: async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ok: 1, member: 'woztell-member-456' }), { status: 200 });
    },
  });

  assertEquals(result, {
    ok: true,
    httpStatus: 200,
    responseBody: { ok: 1, member: 'woztell-member-456' },
    error: null,
  });
  assertEquals(calls[0].url, 'https://bot.api.woztell.com/sendResponses');
  assertEquals((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer secret-token');
  assertEquals(JSON.parse(String(calls[0].init.body)).response[0].text, 'AI reply');
});

Deno.test('sendWoztellTextResponse fails before network when channel and recipient identifiers are missing', async () => {
  const result = await sendWoztellTextResponse({
    accessToken: 'secret-token',
    channelId: null,
    memberId: null,
    recipientId: null,
    text: 'AI reply',
    fetcher: async () => new Response('{}'),
  });

  assertEquals(result, {
    ok: false,
    httpStatus: null,
    responseBody: null,
    error: 'Woztell sendResponses requires channelId and either memberId or recipientId',
  });
});
