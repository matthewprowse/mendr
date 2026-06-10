/**
 * Shared safe-redirect helper.
 *
 * Returns a same-origin path (starts with `/`) extracted from `input`.
 * Falls back to `fallback` for any value that is empty, malformed,
 * protocol-relative (`//host/...`), backslash-prefixed (`\\host`),
 * scheme-bearing (`http:`, `https:`, `javascript:`, `data:`, ...),
 * or that escapes the optional `allowedPathPrefixes` allow-list.
 *
 * Designed for redirect destinations coming from query strings or request
 * bodies, where the value will be handed to `NextResponse.redirect` or
 * `router.push`. Never returns an absolute URL.
 *
 * Notes:
 * - Uses a sentinel origin so we can reuse the WHATWG URL parser to detect
 *   any input that resolves to a different origin than the sentinel.
 * - Backslashes are rejected up-front because the WHATWG URL parser
 *   normalises `\` to `/` for special schemes, which would otherwise let
 *   `\\evil.com/...` slip through the same-origin check on some inputs.
 * - `allowedPathPrefixes` uses segment-boundary matching so `/admin` allows
 *   `/admin` and `/admin/...` but rejects `/administration`.
 */

export type SafeRedirectOptions = {
    /**
     * If provided and non-empty, the resolved pathname must equal one of
     * these prefixes or start with `<prefix>/`. Otherwise the helper falls
     * back. Used by admin login to restrict redirects to `/admin*`.
     */
    allowedPathPrefixes?: readonly string[];
};

const SENTINEL_ORIGIN = 'http://safe-redirect.invalid';

function ensureLeadingSlash(value: string): string | null {
    if (!value.startsWith('/')) return null;
    return value;
}

function isAllowed(pathname: string, prefixes: readonly string[] | undefined): boolean {
    if (!prefixes || prefixes.length === 0) return true;
    for (const prefix of prefixes) {
        if (!prefix.startsWith('/')) continue;
        if (pathname === prefix) return true;
        if (pathname.startsWith(prefix + '/')) return true;
    }
    return false;
}

export function safeRedirectPath(
    input: unknown,
    fallback: string,
    options?: SafeRedirectOptions,
): string {
    const safeFallback = ensureLeadingSlash(fallback) ?? '/';

    if (typeof input !== 'string') return safeFallback;
    const trimmed = input.trim();
    if (trimmed.length === 0) return safeFallback;

    if (!trimmed.startsWith('/')) return safeFallback;
    if (trimmed.includes('\\')) return safeFallback;
    if (trimmed.includes('\0')) return safeFallback;

    let parsed: URL;
    try {
        parsed = new URL(trimmed, SENTINEL_ORIGIN);
    } catch {
        return safeFallback;
    }

    if (parsed.origin !== SENTINEL_ORIGIN) return safeFallback;
    if (!parsed.pathname.startsWith('/')) return safeFallback;

    if (!isAllowed(parsed.pathname, options?.allowedPathPrefixes)) {
        return safeFallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
