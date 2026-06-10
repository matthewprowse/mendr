/* eslint-disable no-console */
/**
 * Web-first phone verification (Phase C, Workstream 4).
 *
 * POST { phone }          → sends a 6-digit code via the link_account_otp template.
 * PUT  { phone, code }    → verifies the code and links the phone.
 *
 * Both require a signed-in user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createOtp, verifyOtp, normalisePhone } from '@/lib/whatsapp/linking';
import { linkAccountOtpTemplate } from '@/lib/whatsapp/templates';
import { sendOutbound } from '@/lib/whatsapp/outbox';

async function requireUser() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return user;
}

export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, 'whatsappOtp');
    if (limited) return limited;

    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    let body: { phone?: unknown };
    try {
        body = (await req.json()) as { phone?: unknown };
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const phone = normalisePhone(String(body.phone ?? ''));
    if (!phone) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });

    const code = await createOtp(phone, user.id);
    if (!code) return NextResponse.json({ error: 'Could not create code' }, { status: 500 });

    const sent = await sendOutbound({
        to: phone,
        kind: 'proactive',
        template: linkAccountOtpTemplate(code),
    });
    if (!sent.ok) {
        return NextResponse.json(
            { error: 'Could not send the WhatsApp code. Is this number on WhatsApp?' },
            { status: 502 },
        );
    }
    return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
    const limited = await checkRateLimit(req, 'whatsappOtp');
    if (limited) return limited;

    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    let body: { phone?: unknown; code?: unknown };
    try {
        body = (await req.json()) as { phone?: unknown; code?: unknown };
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const phone = normalisePhone(String(body.phone ?? ''));
    const code = String(body.code ?? '').replace(/\D/g, '');
    if (!phone || code.length !== 6) {
        return NextResponse.json({ error: 'Invalid phone or code' }, { status: 400 });
    }

    const result = await verifyOtp(phone, code, user.id);
    if (!result.ok) {
        const status = result.reason === 'wrong_code' ? 400 : 410;
        return NextResponse.json({ error: result.reason }, { status });
    }
    return NextResponse.json({ ok: true });
}
