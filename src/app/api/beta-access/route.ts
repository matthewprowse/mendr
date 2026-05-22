/**
 * POST /api/beta-access
 *
 * Validates the beta password and sets a `beta_access` cookie on success.
 * Used by the /coming-soon page to unlock the rest of the app.
 *
 * Body: { password: string }
 * On success: sets cookie + returns { ok: true }
 * On failure: returns 401 { error: 'Wrong password' }
 */

import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME  = 'beta_access';
const COOKIE_VALUE = 'granted';
/** Cookie lives for 30 days — long enough not to annoy testers. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
    const expected = process.env.COMING_SOON_PASSWORD;
    if (!expected) {
        // Gate is disabled — always grant access.
        return NextResponse.json({ ok: true });
    }

    let submitted: string;
    try {
        const body = await req.json();
        submitted = typeof body?.password === 'string' ? body.password.trim() : '';
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    if (!submitted || submitted !== expected) {
        return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, COOKIE_VALUE, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: COOKIE_MAX_AGE,
        secure: process.env.NODE_ENV === 'production',
    });
    return res;
}
