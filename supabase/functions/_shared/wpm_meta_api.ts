/**
 * The single place the Meta Graph API version is decided.
 *
 * Every Graph call in every edge function must build its URL from GRAPH_API_BASE
 * rather than hardcoding a version. Meta retires each version two years after
 * release, so this is a recurring migration — it used to mean editing eleven
 * call sites across five functions and the browser SDK, which is exactly how
 * the codebase ended up still on v20.0 (retired 24 September 2026) months after
 * v21 through v26 shipped.
 *
 * Keep this in step with the Page webhook subscription fields in the App
 * Dashboard: if the payloads Meta sends us are versioned differently from the
 * calls we make back, the mismatch surfaces as missing fields rather than as an
 * error, which is a bad way to find out.
 *
 * Version history for this app: v20.0 → v26.0 on 2026-08-10.
 */

export const GRAPH_API_VERSION = 'v26.0';

export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * The webhook fields every connected Page is subscribed to.
 *
 * There are TWO subscriptions and they are not the same thing. The APP
 * subscribes to topics and fields in the App Dashboard; each PAGE must then be
 * subscribed separately via POST /{page-id}/subscribed_apps. Meta dispatches a
 * field only when both agree, and a Page subscribed to fewer fields fails
 * silently — there is no error, the events simply never arrive.
 *
 * `message_echoes` was missing here until 2026-09-22, and that is the whole
 * reason Facebook echoes never worked while Instagram's did:
 *
 *   Instagram  an echo arrives inside `messages` with is_echo: true   ✅ subscribed
 *   Messenger  an echo is its own field, `message_echoes`             ❌ was not
 *
 * Measured before the fix: 105 outbound Messenger messages sent by us since
 * 2026-06-11 and **zero** echoes received, against 537 / 119 on Instagram. Our
 * own sends echo back on a healthy subscription, so zero-from-105 was the
 * tell. The consequence was that a human replying from the Page inbox existed
 * nowhere — not in the Inbox, and not in the agent's context, so the agent kept
 * answering as though its colleague had never spoken.
 *
 * ⚠️ Changing this constant only affects Pages subscribed AFTER the deploy.
 * Every already-connected Page keeps its old field list until it is
 * re-subscribed — run `meta-verify-webhooks` for each existing channel.
 */
export const PAGE_SUBSCRIBED_FIELDS = 'messages,messaging_postbacks,message_echoes';

// ---------------------------------------------------------------------------
// Sender display name lookup
// ---------------------------------------------------------------------------

/**
 * Messenger and Instagram expose *different* profile fields, and asking for the
 * wrong one returns an error rather than a partial result.
 *
 * Messenger PSIDs go through the Messenger User Profile API, which serves
 * `first_name` / `last_name` / `profile_pic` — there is no `name` field. Asking
 * a PSID for `name` fails every time, which is why every Facebook thread in the
 * Inbox showed a raw 17-digit ID while Instagram threads showed handles.
 *
 * Instagram-scoped IDs are the opposite: `name` and `username` are the real
 * fields, and `first_name` does not exist.
 *
 * Failures stay non-fatal — a missing name must never stop us replying — but
 * they are logged now. The silent `return null` is what let this hide for
 * three months.
 */
export async function fetchMetaUserProfile(
  senderId: string,
  pageAccessToken: string,
  platform: 'messenger' | 'instagram',
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const fields = platform === 'instagram'
    ? 'name,username'
    : 'first_name,last_name';

  try {
    const resp = await fetchImpl(
      `${GRAPH_API_BASE}/${encodeURIComponent(senderId)}?fields=${fields}&access_token=${encodeURIComponent(pageAccessToken)}`,
    );

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.warn(
        `[meta-api] Profile lookup failed for ${platform} ${senderId}: ` +
        `HTTP ${resp.status} ${body.slice(0, 300)}`,
      );
      return null;
    }

    const data = await resp.json() as {
      name?: string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };

    if (platform === 'instagram') {
      // Prefer the @handle — it is what the person is known by, and what the
      // Inbox already shows for every working Instagram thread.
      if (data.username) return `@${data.username}`;
      return data.name ?? null;
    }

    const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
    if (fullName) return fullName;

    console.warn(
      `[meta-api] Profile lookup for messenger ${senderId} returned no name fields: ` +
      JSON.stringify(data).slice(0, 300),
    );
    return null;
  } catch (error) {
    console.warn(`[meta-api] Profile lookup threw for ${platform} ${senderId}: ${error}`);
    return null;
  }
}

/**
 * The message id Meta assigns to a reply we sent, when it accepted it.
 *
 * Worth storing for its own sake — until now no outbound row carried one, so
 * nothing downstream could tell a delivered reply from one Meta rejected.
 */
export function extractSentMessageId(response: unknown): string | null {
  const body = response as { message_id?: unknown } | null;
  return typeof body?.message_id === 'string' ? body.message_id : null;
}

/**
 * Explains a rejected send in terms the owner can act on.
 *
 * Code 10 / subcode 2534022 is Meta's 24-hour messaging window: outside it a
 * business may not message a customer who has not written recently. It is a
 * policy limit, not an outage, and it was previously recorded as an opaque
 * blob of JSON that read like a system failure.
 */
export function describeSendFailure(result: { error?: string; response?: unknown }): string {
  if (result.error) return result.error;

  const err = (result.response as { error?: { message?: string; code?: number; error_subcode?: number } } | null)?.error;
  if (!err) return JSON.stringify(result.response ?? {});

  if (err.code === 10) {
    return (
      "Outside Meta's 24-hour messaging window — this customer has not messaged " +
      'in over 24 hours, so Meta will not deliver a reply until they write again. ' +
      `(Meta: ${err.message ?? 'code 10'})`
    );
  }

  return err.message ?? JSON.stringify(err);
}
