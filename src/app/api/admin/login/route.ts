// Required env vars: ADMIN_PASSWORD

import { NextRequest, NextResponse } from 'next/server';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { createAdminSession, setAdminCookie, clearAdminCookie } from '@/lib/auth/admin-auth';

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => null);
    const submitted = typeof body?.password === 'string' ? body.password : '';
    const expected = process.env.ADMIN_PASSWORD;

    if (!expected || submitted !== expected) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    const token = await createAdminSession();
    if (!token) {
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    // Constrain `redirect` echoed in the response to same-origin /admin paths
    // even though the client also enforces this — defence in depth.
    const next = safeRedirectPath(body?.next, '/admin', {
        allowedPathPrefixes: ['/admin'],
    });

    const res = NextResponse.json({ ok: true, redirect: next });
    setAdminCookie(res, token);
    return res;
}

export async function DELETE() {
    const res = NextResponse.json({ ok: true });
    clearAdminCookie(res);
    return res;
}
