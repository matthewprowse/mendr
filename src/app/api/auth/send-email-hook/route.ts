// Required env vars: NEXT_PUBLIC_SUPABASE_URL, RESEND_API_KEY, RESEND_FROM,
//                    SEND_EMAIL_HOOK_SECRET

import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';
import { dispatchAuthEmails, type AuthHookPayload } from '@/lib/auth-email-dispatch';

export const runtime = 'nodejs';

/**
 * Supabase Auth "Send Email" hook (HTTPS).
 * Dashboard: Project → Authentication → Auth Hooks → Send Email → URL = /api/auth/send-email-hook
 *
 * Requires:
 * - SEND_EMAIL_HOOK_SECRET (from Supabase; format v1,whsec_…)
 * - RESEND_API_KEY, RESEND_FROM (format: "Menda <noreply@menda.co.za>") // TODO(menda-domain): update to real domain once menda.co.za is live
 * - NEXT_PUBLIC_SUPABASE_URL
 * Optional: AUTH_EMAIL_PUBLIC_URL — public origin for `/fonts/Soehne*.otf` (defaults to NEXT_PUBLIC_APP_URL or VERCEL_URL)
 */
export async function POST(req: NextRequest) {
    const rawSecret = process.env.SEND_EMAIL_HOOK_SECRET;
    if (!rawSecret) {
        return NextResponse.json({ error: 'SEND_EMAIL_HOOK_SECRET not set' }, { status: 500 });
    }

    const secret = rawSecret.replace(/^v1,whsec_/, '');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const fromRaw  = process.env.RESEND_FROM ?? '';
    // RESEND_FROM is expected as "Name <email@domain.com>" or bare "email@domain.com"
    const emailMatch = fromRaw.match(/<([^>]+)>/);
    const fromEmail  = emailMatch ? emailMatch[1] : fromRaw;
    const nameMatch  = fromRaw.match(/^([^<]+)</) ;
    const fromName   = nameMatch ? nameMatch[1].trim() : (process.env.RESEND_FROM_NAME || 'Menda');

    if (!supabaseUrl || !process.env.RESEND_API_KEY || !fromEmail) {
        return NextResponse.json({ error: 'Supabase URL or Resend not configured' }, { status: 500 });
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
