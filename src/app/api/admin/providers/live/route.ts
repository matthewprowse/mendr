// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { refreshProviderByPlaceId } from '@/lib/providers/refresh-provider-by-place-id';
import { requireAdmin } from '@/lib/auth/admin-auth';

function cleanStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((x): x is string => typeof x === 'string')
        .map((s) => s.trim())
        .filter(Boolean);
}

export async function GET(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const admin = await createSupabaseAdminClient();

    // Counts come from durable tables: provider_profile_views (Phase 3) and
    // provider_contact_events (the lead log). "Outputs" (times surfaced) is not
    // tracked per provider, so it is reported as null → "Not tracked yet".
    const [
        { data: providers, error: providersError },
        { data: viewRows },
        { data: contactRows },
    ] = await Promise.all([
        admin
            .from('providers')
            .select(
                'id, name, address, rating, rating_count, google_place_id, summary, summary_long, about, past_work, specialisations, highlights, key_person, certifications, enrichment_review_required, enrichment_last_failure, enrichment_last_failure_at',
            )
            .order('name', { ascending: true }),
        admin.from('provider_profile_views').select('provider_id').limit(200000),
        admin.from('provider_contact_events').select('provider_id').limit(200000),
    ]);

    if (providersError) return NextResponse.json({ error: providersError.message }, { status: 500 });

    const viewCounts = new Map<string, number>();
    for (const row of (viewRows ?? []) as Array<{ provider_id: string | null }>) {
        if (!row?.provider_id) continue;
        viewCounts.set(row.provider_id, (viewCounts.get(row.provider_id) ?? 0) + 1);
    }
    const contactCounts = new Map<string, number>();
    for (const row of (contactRows ?? []) as Array<{ provider_id: string | null }>) {
        if (!row?.provider_id) continue;
        contactCounts.set(row.provider_id, (contactCounts.get(row.provider_id) ?? 0) + 1);
    }

    const payload = (providers ?? []).map((p: Record<string, unknown>) => {
        const id = String(p.id);
        return {
            id,
            name: typeof p.name === 'string' ? p.name : 'Unnamed',
            address: typeof p.address === 'string' ? p.address : null,
            rating: typeof p.rating === 'number' ? p.rating : null,
            rating_count: typeof p.rating_count === 'number' ? p.rating_count : 0,
            google_place_id: typeof p.google_place_id === 'string' ? p.google_place_id : null,
            summary: typeof p.summary === 'string' ? p.summary : '',
            summary_long: typeof p.summary_long === 'string' ? p.summary_long : '',
            about: typeof p.about === 'string' ? p.about : '',
            past_work: typeof p.past_work === 'string' ? p.past_work : '',
            specialisations: cleanStringArray(p.specialisations),
            highlights: cleanStringArray(p.highlights),
            key_person: typeof p.key_person === 'string' ? p.key_person : '',
            certifications: cleanStringArray(p.certifications),
            enrichment_review_required: Boolean(p.enrichment_review_required),
            enrichment_last_failure:
                typeof p.enrichment_last_failure === 'string' ? p.enrichment_last_failure : null,
            enrichment_last_failure_at:
                typeof p.enrichment_last_failure_at === 'string' ? p.enrichment_last_failure_at : null,
            output_count: null as number | null,
            contact_count: contactCounts.get(id) ?? 0,
            profile_view_count: viewCounts.get(id) ?? 0,
            avg_output_position: null as number | null,
        };
    });

    return NextResponse.json(payload);
}

/** Re-fetch rating, review count, and related Google data for a provider (by DB id). */
export async function POST(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;
    const body = await req.json().catch(() => null);
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const admin = await createSupabaseAdminClient();
    const { data: row, error: fetchError } = await admin
        .from('providers')
        .select('google_place_id')
        .eq('id', id)
        .maybeSingle();

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
    const placeId = typeof row?.google_place_id === 'string' ? row.google_place_id.trim() : '';
    if (!placeId) {
        return NextResponse.json(
            { error: 'This provider has no Google place id; cannot refresh from Google.' },
            { status: 400 },
        );
    }

    const result = await refreshProviderByPlaceId(placeId);
    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 502 });
    }

    const p = result.provider as Record<string, unknown>;
    return NextResponse.json({
        ok: true,
        rating: typeof p.rating === 'number' ? p.rating : null,
        rating_count: typeof p.rating_count === 'number' ? p.rating_count : 0,
        name: typeof p.name === 'string' ? p.name : null,
        address: typeof p.address === 'string' ? p.address : null,
        summary: typeof p.summary === 'string' ? p.summary : '',
    });
}

export async function PATCH(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;
    const body = await req.json().catch(() => null);
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body?.name === 'string') patch.name = body.name;
    if (typeof body?.address === 'string') patch.address = body.address;
    if (typeof body?.rating === 'number') patch.rating = body.rating;
    if (typeof body?.rating_count === 'number') patch.rating_count = body.rating_count;
    if ('summary' in body && typeof body.summary === 'string') patch.summary = body.summary;
    if ('summary_long' in body && typeof body.summary_long === 'string') patch.summary_long = body.summary_long;
    if ('about' in body && typeof body.about === 'string') patch.about = body.about;
    if ('past_work' in body && typeof body.past_work === 'string') patch.past_work = body.past_work;
    if ('key_person' in body && typeof body.key_person === 'string') patch.key_person = body.key_person;

    for (const field of ['specialisations', 'highlights', 'certifications'] as const) {
        if (!(field in body)) continue;
        if (!Array.isArray(body[field])) {
            return NextResponse.json({ error: `${field} must be an array of strings` }, { status: 400 });
        }
        patch[field] = (body[field] as unknown[])
            .filter((x): x is string => typeof x === 'string')
            .map((s) => s.trim())
            .filter(Boolean);
    }

    if (Object.keys(patch).filter((k) => k !== 'updated_at').length === 0) {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const admin = await createSupabaseAdminClient();
    const { error } = await admin.from('providers').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}
