/**
 * Shared admin authentication helpers.
 *
 * Session token format: `<expiry_unix_ms>.<hmac_hex>`
 *   - expiry_unix_ms: milliseconds since epoch when the token expires
 *   - hmac_hex:       HMAC-SHA-256 of the expiry string, keyed with ADMIN_PASSWORD
 *
 * Uses Web Crypto so it runs in both Node.js API routes and the Next.js Edge
 * runtime used by proxy.ts.
 */

import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'admin_session';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_MAX_AGE_S = SESSION_MAX_AGE_MS / 1000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function hmacHex(data: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    return Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

// Constant-time hex string comparison to prevent timing attacks.
function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) {
        mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new signed session token valid for 24 hours.
 * Returns null if ADMIN_PASSWORD is not configured.
 */
export async function createAdminSession(): Promise<string | null> {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) return null;
    const expiry = (Date.now() + SESSION_MAX_AGE_MS).toString();
    const sig = await hmacHex(expiry, password);
    return `${expiry}.${sig}`;
}

/**
 * Verify the admin_session cookie on the incoming request.
 * Returns true only if the token is present, unexpired, and HMAC-valid.
 */
export async function verifyAdminCookie(req: NextRequest): Promise<boolean> {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) return false;

    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return false;

    const dotIndex = token.indexOf('.');
    if (dotIndex === -1) return false;

    const expiry = token.slice(0, dotIndex);
    const sig = token.slice(dotIndex + 1);

    const expiryMs = parseInt(expiry, 10);
    if (isNaN(expiryMs) || Date.now() > expiryMs) return false;

    const expectedSig = await hmacHex(expiry, password);
    return safeEqual(expectedSig, sig);
}

/**
 * Use in API route handlers.
 * Returns a 401 NextResponse if the cookie is missing or invalid; otherwise null.
 *
 * Usage:
 *   const deny = await requireAdmin(req);
 *   if (deny) return deny;
 */
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
    const valid = await verifyAdminCookie(req);
    if (!valid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return null;
}

/**
 * Set the admin_session cookie on a response.
 */
export function setAdminCookie(res: NextResponse, token: string): void {
    res.cookies.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_MAX_AGE_S,
    });
}

/**
 * Clear the admin_session cookie on a response.
 */
export function clearAdminCookie(res: NextResponse): void {
    res.cookies.delete(COOKIE_NAME);
}
