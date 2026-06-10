// Required env vars: RESEND_API_KEY, RESEND_FROM,
//                    SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { requireAdmin } from '@/lib/auth/admin-auth';


export async function POST(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const apiKey = process.env.RESEND_API_KEY;
    const from   = process.env.RESEND_FROM;
    if (!apiKey || !from) {
        return NextResponse.json({ error: 'Resend not configured' }, { status: 500 });
    }

    const body = await req.json().catch(() => null);
    const providerId = typeof body?.providerId === 'string' ? body.providerId : '';
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
    const text = typeof body?.body === 'string' ? body.body.trim() : '';

    if (!providerId || !subject || !text) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Derive the recipient server-side from the referenced application rather
    // than trusting a client-supplied address, so a CSRF/XSS on the admin UI
    // cannot become an arbitrary-send primitive (finding M6).
    const admin = await createSupabaseAdminClient();
    const { data: application } = await admin
        .from('provider_applications')
        .select('email, contact_name')
        .eq('id', providerId)
        .maybeSingle();
    const toEmail = typeof application?.email === 'string' ? application.email.trim() : '';
    const toName = typeof application?.contact_name === 'string' ? application.contact_name.trim() : '';
    if (!toEmail) {
        return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const resend = new Resend(apiKey);
    const to = toName ? `${toName} <${toEmail}>` : toEmail;

    const { error } = await resend.emails.send({
        to,
        from,
        subject,
        text,
        html: text.replace(/\n/g, '<br>'),
    });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Mark sendgrid_sent_at on the provider record.
    await admin
        .from('provider_applications')
        .update({ sendgrid_sent_at: new Date().toISOString() })
        .eq('id', providerId);

    return NextResponse.json({ ok: true });
}
