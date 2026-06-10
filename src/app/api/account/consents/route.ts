/**
 * GET /api/account/consents — the specialists a homeowner has shared their
 * details with (Phase 3 of the onboarding plan).
 *
 * Reads active rows from `lead_contact_consents` (revoked_at IS NULL), grouped
 * to one entry per specialist, with the business name. Powers the "Specialists
 * you have shared details with" list in Settings > Privacy.
 */

import { NextResponse } from 'next/server';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';

type ProviderRef = { name: string | null };
type ConsentRow = {
    provider_id: string;
    granted_at: string;
    // Supabase types an embedded relation as an array; runtime is a single object
    // for this many-to-one FK, so handle both.
    providers: ProviderRef | ProviderRef[] | null;
};

export async function GET(): Promise<NextResponse> {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('lead_contact_consents')
        .select('provider_id, granted_at, providers(name)')
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .order('granted_at', { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // One entry per specialist (a homeowner may have consented per diagnosis).
    const seen = new Map<string, { provider_id: string; name: string; granted_at: string }>();
    for (const row of (data ?? []) as unknown as ConsentRow[]) {
        if (seen.has(row.provider_id)) continue;
        const ref = Array.isArray(row.providers) ? row.providers[0] : row.providers;
        seen.set(row.provider_id, {
            provider_id: row.provider_id,
            name: ref?.name?.trim() || 'A specialist',
            granted_at: row.granted_at,
        });
    }

    return NextResponse.json({ specialists: Array.from(seen.values()) });
}
