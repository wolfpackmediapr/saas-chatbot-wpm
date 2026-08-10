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
