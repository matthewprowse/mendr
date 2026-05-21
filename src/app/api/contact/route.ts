// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL,
//                    RESEND_API_KEY, RESEND_FROM, RESEND_ADMIN_EMAIL

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

const VALID_SUBJECTS = [
    'General question', 'Provider enquiry', 'Technical issue', 'Partnership', 'Other',
] as const;

export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, 'contactForm'); // dedicated bucket — 5/hr per IP
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    if (name.length > 120) return NextResponse.json({ error: 'Name too long' }, { status: 400 });
    if (message.length > 5000) return NextResponse.json({ error: 'Message too long' }, { status: 400 });

    const admin = await createSupabaseAdminClient();

    const { error } = await admin.from('contact_messages').insert({
        name,
        email,
        subject: subject && VALID_SUBJECTS.includes(subject as any) ? subject : null,
        message,
        status: 'unread',
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Send admin notification email — fire and forget, don't fail the response.
    const apiKey     = process.env.RESEND_API_KEY;
    const from       = process.env.RESEND_FROM;
    const adminEmail = process.env.RESEND_ADMIN_EMAIL || from;

    if (apiKey && from && adminEmail) {
        const resend = new Resend(apiKey);
        void resend.emails
            .send({
                to:      adminEmail,
                from,
                subject: `New Menda contact message from ${name}`,
                text:    [
                    `From: ${name} <${email}>`,
                    `Subject: ${subject || 'No subject'}`,
                    '',
                    message,
                ].join('\n'),
            })
            .catch(() => {});
    }

    return NextResponse.json({ ok: true });
}
