/**
 * Read the real error message out of a Supabase Edge Function response.
 *
 * `supabase.functions.invoke()` does NOT parse the body on a non-2xx reply: it
 * sets `error` to a `FunctionsHttpError` and leaves `data` **null**. So the
 * usual `data?.error || fnError?.message` pattern always falls through to
 * `fnError.message`, which is the constant string
 * "Edge Function returned a non-2xx status code" — a sentence that tells the
 * person reading it nothing at all.
 *
 * That is not hypothetical. On 2026-09-02 a customer trying to connect his Meta
 * account saw exactly that string on his phone, while `meta-fetch-pages` was
 * returning a perfectly good explanation in the response body that the UI threw
 * away. The function was doing its job; the screen was hiding the answer.
 *
 * The raw `Response` survives on `FunctionsHttpError.context`, so the body is
 * still readable — we just have to ask for it.
 */

/** The message supabase-js uses for every non-2xx. Never worth showing anyone. */
const GENERIC_HTTP_ERROR = 'Edge Function returned a non-2xx status code';

interface FunctionErrorBody {
  error?: string;
  /** Optional follow-up telling the user what to actually do about it. */
  hint?: string;
  details?: unknown;
}

function joinErrorAndHint(body: FunctionErrorBody): string | null {
  if (!body.error) return null;
  return body.hint ? `${body.error} ${body.hint}` : String(body.error);
}

/**
 * Resolve the most specific message available, most specific first:
 *   1. a body the function returned with HTTP 200 (`{ success: false, error }`)
 *   2. the body of a non-2xx reply, recovered from `FunctionsHttpError.context`
 *   3. the thrown error's own message, unless it is the useless generic one
 *   4. the caller's fallback
 *
 * Never throws — a diagnostic path that can fail is worse than no diagnostic.
 */
export async function readFunctionError(
  fnError: unknown,
  data: unknown,
  fallback: string,
): Promise<string> {
  const inline = joinErrorAndHint((data ?? {}) as FunctionErrorBody);
  if (inline) return inline;

  const context = (fnError as { context?: unknown } | null)?.context;
  if (context && typeof (context as Response).json === 'function') {
    try {
      // clone() so a caller that also wants to read the body still can, and so
      // an already-consumed stream throws here rather than higher up.
      const body = (await (context as Response).clone().json()) as FunctionErrorBody;
      const fromBody = joinErrorAndHint(body);
      if (fromBody) return fromBody;
    } catch {
      // Body was empty, not JSON, or already read. Fall through to the message.
    }
  }

  const message = (fnError as { message?: string } | null)?.message;
  if (message && message !== GENERIC_HTTP_ERROR) return message;

  return fallback;
}
