// Required env vars: RESEND_API_KEY, RESEND_FROM, ADMIN_PASSWORD,
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
    const messageId = typeof body?.messageId === 'string' ? body.messageId : '';
    const replyText = typeof body?.replyText === 'string' ? body.replyText.trim() : '';
    const toEmail = typeof body?.email === 'string' ? body.email.trim() : '';
    const toName = typeof body?.name === 'string' ? body.name.trim() : '';
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : 'Reply from Menda';

    if (!messageId || !replyText || !toEmail) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const resend = new Resend(apiKey);
    const to = toName ? `${toName} <${toEmail}>` : toEmail;

    const { error } = await resend.emails.send({
        to,
        from,
        subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
        text:    replyText,
        html:    replyText.replace(/\n/g, '<br>'),
    });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update the contact message record.
    const admin = await createSupabaseAdminClient();
    await admin
        .from('contact_messages')
        .update({
            status: 'replied',
            replied_at: new Date().toISOString(),
            reply_text: replyText,
        })
        .eq('id', messageId);

    return NextResponse.json({ ok: true });
}
