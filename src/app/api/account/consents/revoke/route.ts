/**
 * POST /api/account/consents/revoke — withdraw consent for one specialist
 * (Phase 3 of the onboarding plan).
 *
 * Stamps revoked_at on every active `lead_contact_consents` row for this
 * homeowner and specialist. Revoking stops Mendr showing the details going
 * forward and (once the Pro portal exists) flags the specialist to delete them;
 * it cannot recall a message the homeowner already sent.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest): Promise<NextResponse> {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { providerId?: unknown };
    const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : '';
    if (!providerId || !UUID_RE.test(providerId)) {
        return NextResponse.json({ error: 'A valid providerId is required.' }, { status: 400 });
    }

    const admin = await createSupabaseAdminClient();
    const { error } = await admin
        .from('lead_contact_consents')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('provider_id', providerId)
        .is('revoked_at', null);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
