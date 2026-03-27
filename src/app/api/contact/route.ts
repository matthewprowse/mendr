// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL,
//                    SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, SENDGRID_ADMIN_EMAIL

import { NextRequest, NextResponse } from 'next/server';
import sgMail from '@sendgrid/mail';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

const VALID_SUBJECTS = [
    'General question', 'Provider enquiry', 'Technical issue', 'Partnership', 'Other',
] as const;

export async function POST(req: NextRequest) {
    const limited = checkRateLimit(req, 'reviews'); // 5/hr — same as review submissions
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
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    const adminEmail = process.env.SENDGRID_ADMIN_EMAIL || fromEmail;

    if (apiKey && fromEmail && adminEmail) {
        sgMail.setApiKey(apiKey);
        void sgMail
            .send({
                to: adminEmail,
                from: { email: fromEmail, name: 'Scandio' },
                subject: `New Scandio contact message from ${name}`,
                text: [
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
