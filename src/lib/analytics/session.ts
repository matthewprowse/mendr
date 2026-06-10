import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';

// Matches the anonymous ownership cookie under either name (mendr_anon, or the
// legacy scandio_anon still held by existing browsers). The session id is keyed
// on the cookie value, which is preserved across the rename, so analytics
// continuity is unaffected.
const ANON_COOKIE_RE = /(?:mendr_anon|scandio_anon)=([a-f0-9-]{36})/;

/**
 * Server-derived analytics session id (finding L3).
 *
 * Analytics rows key honest counts on COUNT(DISTINCT session_id). Trusting a
 * client-supplied session_id let a caller vary it to inflate those metrics.
 * Derive it server-side instead: prefer the server-issued, HttpOnly anonymous
 * cookie (stable per browser, unforgeable by the client); fall back to a hash
 * of IP + user-agent. The client value is ignored entirely.
 */
export function analyticsSessionId(req: NextRequest): string {
    const cookieHeader = req.headers.get('cookie') || '';
    const m = cookieHeader.match(ANON_COOKIE_RE);
    if (m?.[1]) return `a:${m[1]}`;

    const forwarded = req.headers.get('x-forwarded-for') || '';
    const ip = forwarded.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const ua = req.headers.get('user-agent') || '';
    return `h:${createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 40)}`;
}
