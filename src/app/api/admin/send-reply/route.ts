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
    const messageId = typeof body?.messageId === 'string' ? body.messageId : '';
    const replyText = typeof body?.replyText === 'string' ? body.replyText.trim() : '';
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : 'Reply from Mendr';

    if (!messageId || !replyText) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Derive the recipient server-side from the referenced contact message
    // rather than trusting a client-supplied address (finding M6).
    const admin = await createSupabaseAdminClient();
    const { data: message } = await admin
        .from('contact_messages')
        .select('email, name')
        .eq('id', messageId)
        .maybeSingle();
    const toEmail = typeof message?.email === 'string' ? message.email.trim() : '';
    const toName = typeof message?.name === 'string' ? message.name.trim() : '';
    if (!toEmail) {
        return NextResponse.json({ error: 'Message not found' }, { status: 404 });
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
