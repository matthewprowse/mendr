import { NextRequest, NextResponse } from 'next/server';
import sgMail from '@sendgrid/mail';
import { Webhook } from 'standardwebhooks';
import { dispatchAuthEmails, type AuthHookPayload } from '@/lib/auth-email-dispatch';

export const runtime = 'nodejs';

/**
 * Supabase Auth "Send Email" hook (HTTPS).
 * Dashboard: Project → Authentication → Auth Hooks → Send Email → URL = /api/auth/send-email-hook
 *
 * Requires:
 * - SEND_EMAIL_HOOK_SECRET (from Supabase; format v1,whsec_…)
 * - SENDGRID_API_KEY, SENDGRID_FROM_EMAIL (same as contact form)
 * - NEXT_PUBLIC_SUPABASE_URL
 * Optional: AUTH_EMAIL_PUBLIC_URL — public origin for /fonts/Sohne-*.otf (defaults to NEXT_PUBLIC_APP_URL or VERCEL_URL)
 */
export async function POST(req: NextRequest) {
    const rawSecret = process.env.SEND_EMAIL_HOOK_SECRET;
    if (!rawSecret) {
        return NextResponse.json({ error: 'SEND_EMAIL_HOOK_SECRET not set' }, { status: 500 });
    }

    const secret = rawSecret.replace(/^v1,whsec_/, '');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    const fromName = process.env.SENDGRID_FROM_NAME || 'Scandio';

    if (!supabaseUrl || !apiKey || !fromEmail) {
        return NextResponse.json({ error: 'Supabase URL or SendGrid not configured' }, { status: 500 });
    }

    const payloadText = await req.text();
    const headers = Object.fromEntries(req.headers);

    const wh = new Webhook(secret);
    let payload: AuthHookPayload;
    try {
        payload = wh.verify(payloadText, headers) as AuthHookPayload;
    } catch {
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    sgMail.setApiKey(apiKey);

    try {
        await dispatchAuthEmails(payload, supabaseUrl, fromEmail, fromName);
    } catch (err: unknown) {
        const msg =
            err && typeof err === 'object' && 'message' in err
                ? String((err as { message: unknown }).message)
                : 'Send failed';
        console.error('[send-email-hook]', msg, err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }

    return NextResponse.json({}, { status: 200 });
}
