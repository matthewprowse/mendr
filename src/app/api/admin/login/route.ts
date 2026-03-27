// Required env vars: ADMIN_PASSWORD

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => null);
    const submitted = typeof body?.password === 'string' ? body.password : '';
    const expected = process.env.ADMIN_PASSWORD;

    if (!expected || submitted !== expected) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    const token = Buffer.from(expected).toString('base64');
    const next = typeof body?.next === 'string' ? body.next : '/admin';

    const res = NextResponse.json({ ok: true, redirect: next });
    res.cookies.set('admin_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return res;
}

export async function DELETE() {
    const res = NextResponse.json({ ok: true });
    res.cookies.delete('admin_session');
    return res;
}
