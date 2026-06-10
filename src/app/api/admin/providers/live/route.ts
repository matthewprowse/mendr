// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { refreshProviderByPlaceId } from '@/lib/providers/refresh-provider-by-place-id';
import { requireAdmin } from '@/lib/auth/admin-auth';
import { computeNextEnrichment } from '@/lib/admin/provider-enrichment-schedule';

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
        { data: cacheRows },
    ] = await Promise.all([
        admin
            .from('providers')
            .select(
                'id, name, address, phone, website, rating, rating_count, mendr_rating, mendr_rating_count, google_place_id, summary, summary_long, about, past_work, specialisations, service_areas, highlights, key_person, certifications, is_active, is_verified, google_generative_summary, google_editorial_summary, created_at, updated_at, last_updated, last_matched_at, reviews_synced_at, enrichment_review_required, enrichment_last_failure, enrichment_last_failure_at',
            )
            .order('name', { ascending: true })
            .range(0, 9999),
        admin.from('provider_profile_views').select('provider_id').limit(200000),
        admin.from('provider_contact_events').select('provider_id').limit(200000),
        admin
            .from('provider_cache')
            .select(
                'provider_id, created_at, scraped_at, enriched_at, updated_at, scrape_status, enrichment_quality, needs_enrichment',
            )
            .limit(200000),
    ]);

    if (providersError)
        return NextResponse.json({ error: providersError.message }, { status: 500 });

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

    type CacheRow = {
        provider_id: string | null;
        created_at: string | null;
        scraped_at: string | null;
        enriched_at: string | null;
        updated_at: string | null;
        scrape_status: string | null;
        enrichment_quality: string | null;
        needs_enrichment: boolean | null;
    };
    const cacheByProvider = new Map<string, CacheRow>();
    for (const row of (cacheRows ?? []) as CacheRow[]) {
        if (!row?.provider_id) continue;
        cacheByProvider.set(row.provider_id, row);
    }

    const now = new Date();
    const payload = (providers ?? []).map((p: Record<string, unknown>) => {
        const id = String(p.id);
        const cache = cacheByProvider.get(id) ?? null;
        const nextEnrichment = computeNextEnrichment(
            {
                hasCacheRow: cache != null,
                scrapeStatus: cache?.scrape_status ?? null,
                enrichmentQuality: cache?.enrichment_quality ?? null,
                scrapedAt: cache?.scraped_at ?? null,
                enrichedAt: cache?.enriched_at ?? null,
                updatedAt: cache?.updated_at ?? null,
                needsEnrichment: Boolean(cache?.needs_enrichment),
            },
            now,
        );
        return {
            id,
            name: typeof p.name === 'string' ? p.name : 'Unnamed',
            address: typeof p.address === 'string' ? p.address : null,
            phone: typeof p.phone === 'string' ? p.phone : null,
            website: typeof p.website === 'string' ? p.website : null,
            rating: typeof p.rating === 'number' ? p.rating : null,
            rating_count: typeof p.rating_count === 'number' ? p.rating_count : 0,
            mendr_rating: typeof p.mendr_rating === 'number' ? p.mendr_rating : null,
            mendr_rating_count:
                typeof p.mendr_rating_count === 'number' ? p.mendr_rating_count : 0,
            google_place_id: typeof p.google_place_id === 'string' ? p.google_place_id : null,
            summary: typeof p.summary === 'string' ? p.summary : '',
            summary_long: typeof p.summary_long === 'string' ? p.summary_long : '',
            about: typeof p.about === 'string' ? p.about : '',
            past_work: typeof p.past_work === 'string' ? p.past_work : '',
            specialisations: cleanStringArray(p.specialisations),
            service_areas: cleanStringArray(p.service_areas),
            highlights: cleanStringArray(p.highlights),
            key_person: typeof p.key_person === 'string' ? p.key_person : '',
            certifications: cleanStringArray(p.certifications),
            google_generative_summary:
                typeof p.google_generative_summary === 'string'
                    ? p.google_generative_summary
                    : '',
            google_editorial_summary:
                typeof p.google_editorial_summary === 'string'
                    ? p.google_editorial_summary
                    : '',
            is_active: Boolean(p.is_active),
            is_verified: Boolean(p.is_verified),
            created_at: typeof p.created_at === 'string' ? p.created_at : null,
            updated_at: typeof p.updated_at === 'string' ? p.updated_at : null,
            last_updated: typeof p.last_updated === 'string' ? p.last_updated : null,
            last_matched_at: typeof p.last_matched_at === 'string' ? p.last_matched_at : null,
            reviews_synced_at:
                typeof p.reviews_synced_at === 'string' ? p.reviews_synced_at : null,
            enrichment_review_required: Boolean(p.enrichment_review_required),
            enrichment_last_failure:
                typeof p.enrichment_last_failure === 'string'
                    ? p.enrichment_last_failure
                    : null,
            enrichment_last_failure_at:
                typeof p.enrichment_last_failure_at === 'string'
                    ? p.enrichment_last_failure_at
                    : null,
            // Enrichment lifecycle (from provider_cache).
            enrichment_first_at: cache?.created_at ?? null,
            enrichment_last_at: cache?.enriched_at ?? null,
            enrichment_last_scraped_at: cache?.scraped_at ?? null,
            enrichment_scrape_status: cache?.scrape_status ?? null,
            enrichment_quality: cache?.enrichment_quality ?? null,
            enrichment_next_at: nextEnrichment.at,
            enrichment_next_scheduled: nextEnrichment.scheduled,
            enrichment_next_basis: nextEnrichment.basis,
            output_count: null as number | null,
            contact_count: contactCounts.get(id) ?? 0,
            profile_view_count: viewCounts.get(id) ?? 0,
            avg_output_position: null as number | null,
        };
    });

    return NextResponse.json(payload);
}

/**
 * Two modes:
 *   - { place_id } → add a new provider by fetching it from Google Places and
 *     upserting it into `providers` (idempotent on google_place_id).
 *   - { id } → re-fetch rating, review count, and related Google data for an
 *     existing provider (by DB id).
 */
export async function POST(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;
    const body = await req.json().catch(() => null);

    // Add-provider mode: create/refresh straight from a Google place id.
    const placeIdInput = typeof body?.place_id === 'string' ? body.place_id.trim() : '';
    if (placeIdInput) {
        const result = await refreshProviderByPlaceId(placeIdInput);
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
        const p = result.provider as Record<string, unknown>;
        return NextResponse.json({
            ok: true,
            id: result.providerId,
            name: typeof p.name === 'string' ? p.name : null,
            address: typeof p.address === 'string' ? p.address : null,
        });
    }

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

/**
 * Hard-delete a provider by id. All referencing rows cascade
 * (reviews, images, contact_events, profile_views, rotation/outcome tokens),
 * and provider_applications.matched_provider_id is set null.
 */
export async function DELETE(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const id = req.nextUrl.searchParams.get('id')?.trim() ?? '';
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const admin = await createSupabaseAdminClient();
    const { error } = await admin.from('providers').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
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
    if ('summary_long' in body && typeof body.summary_long === 'string')
        patch.summary_long = body.summary_long;
    if ('about' in body && typeof body.about === 'string') patch.about = body.about;
    if ('past_work' in body && typeof body.past_work === 'string')
        patch.past_work = body.past_work;
    if ('key_person' in body && typeof body.key_person === 'string')
        patch.key_person = body.key_person;

    for (const field of ['specialisations', 'highlights', 'certifications'] as const) {
        if (!(field in body)) continue;
        if (!Array.isArray(body[field])) {
            return NextResponse.json(
                { error: `${field} must be an array of strings` },
                { status: 400 },
            );
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
