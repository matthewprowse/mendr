/**
 * Ownership resolution for diagnosis rows (findings C4 / C5).
 *
 * Diagnoses belong either to an authenticated Supabase user (`user_id`) or, for
 * the pre-signup flow, to the holder of the `scandio_anon` cookie (`anon_key`).
 * The `/api/diagnoses/[id]` GET/PATCH and `/api/diagnoses/location` routes use
 * the service role (bypassing RLS), so they must verify ownership by hand
 * before reading or mutating a row keyed on a client-supplied id.
 *
 * This is the focused precursor to the broader `withOwnedDiagnosis` wrapper in
 * finding M12.
 */

import type { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';

const ANON_COOKIE_NAME = 'scandio_anon';
// Matches the UUID issued by the diagnosis quota path (api/diagnose/quota.ts).
const ANON_COOKIE_RE = /scandio_anon=([a-f0-9-]{36})/;

export interface DiagnosisIdentity {
    /** Authenticated Supabase user id, or null for anonymous callers. */
    userId: string | null;
    /** scandio_anon cookie value, or null when no cookie was sent. */
    anonKey: string | null;
}

/** The owner columns required to authorize access to a diagnosis row. */
export interface DiagnosisOwner {
    user_id: string | null;
    anon_key: string | null;
}

/** Read the scandio_anon cookie straight off the request (HttpOnly, so the
 *  raw cookie header is the only place it appears server-side). */
export function readAnonKey(req: NextRequest): string | null {
    const cookieHeader = req.headers.get('cookie') || '';
    const m = cookieHeader.match(ANON_COOKIE_RE);
    return m?.[1] ?? null;
}

/** Resolve the caller's identity: their session user (if signed in) and their
 *  anonymous cookie (if present). Both may be set during the signup hand-off. */
export async function resolveDiagnosisIdentity(req: NextRequest): Promise<DiagnosisIdentity> {
    let userId: string | null = null;
    try {
        const client = await createSupabaseServerClient();
        const {
            data: { user },
        } = await client.auth.getUser();
        userId = user?.id ?? null;
    } catch {
        // SSR client unavailable / misconfigured — treat the caller as anonymous.
    }
    return { userId, anonKey: readAnonKey(req) };
}

/**
 * Whether `identity` may read or mutate a diagnosis row with the given owner
 * columns. Authenticated rows require a matching session user; anonymous rows
 * require the matching scandio_anon cookie. A row that is unowned (no user_id
 * and no anon_key — only possible for legacy rows created before this binding)
 * is never accessible through the service-role routes.
 */
export function ownsDiagnosis(owner: DiagnosisOwner, identity: DiagnosisIdentity): boolean {
    if (owner.user_id) {
        return identity.userId != null && owner.user_id === identity.userId;
    }
    if (owner.anon_key) {
        return identity.anonKey != null && owner.anon_key === identity.anonKey;
    }
    return false;
}

/** Build the Set-Cookie header that mints a fresh scandio_anon cookie. Used
 *  when an anonymous row is created for a caller that has no cookie yet. */
export function mintAnonCookie(value: string): string {
    return `${ANON_COOKIE_NAME}=${value}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax; HttpOnly`;
}
