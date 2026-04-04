// Required env vars: SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, ADMIN_PASSWORD,
//                    SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL

import { NextRequest, NextResponse } from 'next/server';
import sgMail from '@sendgrid/mail';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

function checkAdminCookie(req: NextRequest): boolean {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) return false;
    const session = req.cookies.get('admin_session')?.value;
    return session === Buffer.from(password).toString('base64');
}

export async function POST(req: NextRequest) {
    if (!checkAdminCookie(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    if (!apiKey || !fromEmail) {
        return NextResponse.json({ error: 'SendGrid not configured' }, { status: 500 });
    }

    const body = await req.json().catch(() => null);
    const providerId = typeof body?.providerId === 'string' ? body.providerId : '';
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
    const text = typeof body?.body === 'string' ? body.body.trim() : '';
    const toEmail = typeof body?.email === 'string' ? body.email.trim() : '';
    const toName = typeof body?.name === 'string' ? body.name.trim() : '';

    if (!providerId || !subject || !text || !toEmail) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    sgMail.setApiKey(apiKey);

    try {
        await sgMail.send({
            to: { email: toEmail, name: toName },
            from: { email: fromEmail, name: 'Scandio' },
            subject,
            text,
            html: text.replace(/\n/g, '<br>'),
        });
    } catch (err: any) {
        const msg = err?.response?.body?.errors?.[0]?.message || err?.message || 'SendGrid error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }

    // Mark sendgrid_sent_at on the provider record.
    if (providerId) {
        const admin = await createSupabaseAdminClient();
        await admin
            .from('provider_applications')
            .update({ sendgrid_sent_at: new Date().toISOString() })
            .eq('id', providerId);
    }

    return NextResponse.json({ ok: true });
}
