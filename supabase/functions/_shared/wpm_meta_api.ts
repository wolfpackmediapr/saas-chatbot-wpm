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
