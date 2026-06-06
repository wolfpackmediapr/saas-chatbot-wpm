export interface WoztellTextSendPayload {
  channelId: string;
  memberId?: string | null;
  recipientId?: string | null;
  response: Array<{
    type: 'TEXT';
    text: string;
  }>;
}

export interface WoztellSendTextArgs {
  accessToken: string | null | undefined;
  channelId: string | null | undefined;
  memberId?: string | null;
  recipientId?: string | null;
  text: string;
  fetcher?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  endpoint?: string;
}

export type WoztellSendResult =
  | {
      ok: true;
      httpStatus: number;
      responseBody: unknown;
      error: null;
    }
  | {
      ok: false;
      httpStatus: number | null;
      responseBody: unknown;
      error: string;
    };

export function buildWoztellTextSendPayload(args: {
  channelId: string;
  memberId?: string | null;
  recipientId?: string | null;
  text: string;
}): WoztellTextSendPayload {
  return {
    channelId: args.channelId,
    memberId: args.memberId ?? null,
    recipientId: args.recipientId ?? null,
    response: [
      {
        type: 'TEXT',
        text: args.text,
      },
    ],
  };
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

export async function sendWoztellTextResponse(args: WoztellSendTextArgs): Promise<WoztellSendResult> {
  const endpoint = args.endpoint ?? 'https://bot.api.woztell.com/sendResponses';
  const fetcher = args.fetcher ?? fetch;
  const accessToken = args.accessToken?.trim();
  const channelId = args.channelId?.trim();
  const memberId = args.memberId?.trim() || null;
  const recipientId = args.recipientId?.trim() || null;

  if (!accessToken) {
    return {
      ok: false,
      httpStatus: null,
      responseBody: null,
      error: 'WOZTELL_BOT_API_ACCESS_TOKEN is not configured',
    };
  }

  if (!channelId || (!memberId && !recipientId)) {
    return {
      ok: false,
      httpStatus: null,
      responseBody: null,
      error: 'Woztell sendResponses requires channelId and either memberId or recipientId',
    };
  }

  try {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(buildWoztellTextSendPayload({
        channelId,
        memberId,
        recipientId,
        text: args.text,
      })),
    });
    const responseBody = await parseBody(response);

    if (!response.ok) {
      return {
        ok: false,
        httpStatus: response.status,
        responseBody,
        error: `Woztell sendResponses failed with HTTP ${response.status}`,
      };
    }

    const okFlag = typeof responseBody === 'object' && responseBody !== null && 'ok' in responseBody
      ? (responseBody as { ok?: unknown }).ok
      : undefined;

    if (okFlag === 0 || okFlag === false) {
      const error = typeof responseBody === 'object' && responseBody !== null && 'error' in responseBody
        ? String((responseBody as { error?: unknown }).error)
        : 'Woztell sendResponses returned ok=0';

      return {
        ok: false,
        httpStatus: response.status,
        responseBody,
        error,
      };
    }

    return {
      ok: true,
      httpStatus: response.status,
      responseBody,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      responseBody: null,
      error: error instanceof Error ? error.message : 'Woztell sendResponses request failed',
    };
  }
}
