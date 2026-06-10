/**
 * Homeowner phone capture (Phase 1 of the onboarding plan).
 *
 * Stores the homeowner's mobile on `profiles`, normalised to 27XXXXXXXXX and
 * UNVERIFIED for now (phone_verified_at is left untouched). The number is the
 * asset the Pro lead model depends on: it is shared with a Pro at the consent
 * gate (Phase 2). OTP verification is a later addition.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { normalizeSaPhone, isValidSaMobile } from '@/lib/phone';

export async function GET(): Promise<NextResponse> {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const { data } = await supabase
        .from('profiles')
        .select('phone, phone_verified_at')
        .or(`id.eq.${user.id},user_id.eq.${user.id}`)
        .maybeSingle();

    return NextResponse.json({
        phone: data?.phone ?? null,
        verified: Boolean(data?.phone_verified_at),
    });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { phone?: unknown };
    const raw = typeof body.phone === 'string' ? body.phone.trim() : '';

    if (!raw) {
        return NextResponse.json({ error: 'A mobile number is required.' }, { status: 400 });
    }
    if (!isValidSaMobile(raw)) {
        return NextResponse.json(
            { error: 'Enter a valid South African mobile number.' },
            { status: 400 },
        );
    }

    const normalized = normalizeSaPhone(raw);
    if (!normalized) {
        return NextResponse.json(
            { error: 'Enter a valid South African mobile number.' },
            { status: 400 },
        );
    }

    // Admin client + dual-column filter mirrors the profile PATCH route, which
    // handles both the `id` and legacy `user_id` keying on profiles.
    const admin = await createSupabaseAdminClient();
    const { error } = await admin
        .from('profiles')
        .update({ phone: normalized })
        .or(`id.eq.${user.id},user_id.eq.${user.id}`);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, phone: normalized });
}
