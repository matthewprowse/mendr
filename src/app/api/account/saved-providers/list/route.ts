/**
 * GET /api/account/saved-providers/list
 *
 * Returns the current user's saved providers, joined to public.providers so the
 * Favourites page can display real names/ratings/addresses. Skips inactive
 * providers and rows where the join failed (e.g. provider was deleted after
 * being saved).
 *
 * Auth required — returns 401 when unauthenticated.
 * No rate limit bucket — caller is the user's own session, low traffic.
 */

import { NextResponse } from 'next/server';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';

export async function GET(): Promise<NextResponse> {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const admin = await createSupabaseAdminClient();

    const { data: savedRows, error: savedErr } = await admin
        .from('saved_providers')
        .select('id, provider_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (savedErr) {
        return NextResponse.json({ providers: [], error: savedErr.message }, { status: 200 });
    }

    if (!savedRows || savedRows.length === 0) {
        return NextResponse.json({ providers: [] });
    }

    // provider_id is text and can be either a providers.id UUID or a
    // google_place_id — match against both.
    const ids = Array.from(
        new Set(savedRows.map((r) => r.provider_id).filter((v): v is string => Boolean(v)))
    );

    const { data: providers, error: provErr } = await admin
        .from('providers')
        .select('id, google_place_id, name, address, rating, rating_count, specialisations, is_active')
        .or(
            `id.in.(${ids.map((i) => `"${i}"`).join(',')}),google_place_id.in.(${ids.map((i) => `"${i}"`).join(',')})`
        );

    if (provErr) {
        return NextResponse.json({ providers: [], error: provErr.message }, { status: 200 });
    }

    const byId = new Map<string, NonNullable<typeof providers>[number]>();
    for (const p of providers ?? []) {
        if (p.id) byId.set(p.id, p);
        if (p.google_place_id) byId.set(p.google_place_id, p);
    }

    const result = savedRows
        .map((saved) => {
            const p = byId.get(saved.provider_id ?? '');
            if (!p || p.is_active === false) return null;
            return {
                savedId: saved.id,
                savedAt: saved.created_at,
                providerId: p.id ?? saved.provider_id,
                googlePlaceId: p.google_place_id,
                name: p.name,
                address: p.address,
                rating: p.rating,
                ratingCount: p.rating_count,
                specialisations: p.specialisations ?? [],
            };
        })
        .filter(Boolean);

    return NextResponse.json({ providers: result });
}
