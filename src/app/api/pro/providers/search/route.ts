/**
 * GET /api/pro/providers/search?q=... — find an unclaimed provider to claim
 * (Phase 4). Returns matching unclaimed, non-merged providers with the number of
 * leads already waiting on each (the acquisition lever).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';

export async function GET(req: NextRequest): Promise<NextResponse> {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
    if (q.length < 2) return NextResponse.json({ providers: [] });

    const admin = await createSupabaseAdminClient();

    const { data: providers, error } = await admin
        .from('providers')
        .select('id, name, address')
        .ilike('name', `%${q}%`)
        .is('claimed_by_user_id', null)
        .is('merged_into', null)
        .eq('is_active', true)
        .limit(10);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const ids = (providers ?? []).map((p) => (p as { id: string }).id);
    const leadCounts = new Map<string, number>();
    if (ids.length > 0) {
        const { data: events } = await admin
            .from('provider_contact_events')
            .select('provider_id')
            .in('provider_id', ids);
        for (const e of (events ?? []) as { provider_id: string }[]) {
            leadCounts.set(e.provider_id, (leadCounts.get(e.provider_id) ?? 0) + 1);
        }
    }

    const results = (providers ?? []).map((p) => {
        const row = p as { id: string; name: string | null; address: string | null };
        return {
            id: row.id,
            name: row.name ?? 'Unnamed business',
            address: row.address ?? '',
            leads: leadCounts.get(row.id) ?? 0,
        };
    });

    // Surface businesses with waiting leads first.
    results.sort((a, b) => b.leads - a.leads);

    return NextResponse.json({ providers: results });
}
