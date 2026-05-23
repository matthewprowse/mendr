// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL,
//                    RESEND_API_KEY, RESEND_FROM, RESEND_ADMIN_EMAIL

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Resend } from 'resend';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { parseJsonBody } from '@/lib/api/validation';

const VALID_SUBJECTS = [
    'General question', 'Provider enquiry', 'Technical issue', 'Partnership', 'Other',
] as const;

const ContactSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(120, 'Name too long'),
    email: z
        .string()
        .transform((s) => s.trim().toLowerCase())
        .pipe(z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Valid email is required')),
    subject: z.string().trim().optional().default(''),
    message: z.string().trim().min(1, 'Message is required').max(5000, 'Message too long'),
});

export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, 'contactForm'); // dedicated bucket — 5/hr per IP
    if (limited) return limited;

    const parsed = await parseJsonBody(req, ContactSchema);
    if ('error' in parsed) return parsed.error;
    const { name, email, subject, message } = parsed.data;

    const admin = await createSupabaseAdminClient();

    const { error } = await admin.from('contact_messages').insert({
        name,
        email,
        subject: subject && VALID_SUBJECTS.includes(subject as (typeof VALID_SUBJECTS)[number]) ? subject : null,
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
