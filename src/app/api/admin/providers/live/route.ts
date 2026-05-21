// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { refreshProviderByPlaceId } from '@/lib/providers/refresh-provider-by-place-id';
import {
    CERTIFICATION_SLUGS,
    getCertificationBySlug,
} from '@/lib/certifications/catalog';
import { requireAdmin } from '@/lib/auth/admin-auth';

const ALLOWED_COMPANY_SIZES = new Set(['solo', 'small', 'mid', 'large']);


type ProviderPerfRow = {
    provider_id: string;
    event_type: 'match_view' | 'provider_profile_view' | 'provider_contact';
};

export async function GET(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const admin = await createSupabaseAdminClient();

    const [
        { data: providers, error: providersError },
        { data: perfRows, error: perfError },
        { data: certRows, error: certError },
    ] = await Promise.all([
        admin
            .from('providers')
            .select(
                'id, name, address, rating, rating_count, google_place_id, summary, summary_long, about, past_work, specialisations, highlights, key_person, company_size, company_size_source, years_in_business, years_in_business_source, enrichment_review_required, enrichment_last_failure, enrichment_last_failure_at'
            )
            .order('name', { ascending: true }),
        admin
            .from('diagnosis_events')
            .select('provider_id, event_type')
            .in('event_type', ['match_view', 'provider_profile_view', 'provider_contact'])
            .not('provider_id', 'is', null)
            .limit(100000),
        admin
            .from('provider_certifications')
            .select('provider_id, slug, label, source'),
    ]);

    if (providersError) return NextResponse.json({ error: providersError.message }, { status: 500 });
    if (perfError) return NextResponse.json({ error: perfError.message }, { status: 500 });
    if (certError) return NextResponse.json({ error: certError.message }, { status: 500 });

    const certsByProviderId = new Map<
        string,
        Array<{ slug: string; label: string; source: string }>
    >();
    for (const row of (certRows ?? []) as Array<{
        provider_id: string;
        slug: string;
        label: string;
        source: string;
    }>) {
        if (!row?.provider_id || !row?.slug) continue;
        const list = certsByProviderId.get(row.provider_id) ?? [];
        list.push({ slug: row.slug, label: row.label, source: row.source });
        certsByProviderId.set(row.provider_id, list);
    }

    const counts = new Map<string, { outputs: number; contacts: number; profileViews: number }>();
    for (const row of (perfRows ?? []) as ProviderPerfRow[]) {
        if (!row.provider_id) continue;
        const bucket = counts.get(row.provider_id) ?? { outputs: 0, contacts: 0, profileViews: 0 };
        if (row.event_type === 'match_view' || row.event_type === 'provider_profile_view') bucket.outputs += 1;
        if (row.event_type === 'provider_profile_view') bucket.profileViews += 1;
        if (row.event_type === 'provider_contact') bucket.contacts += 1;
        counts.set(row.provider_id, bucket);
    }

    const payload = (providers ?? []).map((p: any) => {
        const c = counts.get(String(p.id)) ?? { outputs: 0, contacts: 0, profileViews: 0 };
        return {
            id: String(p.id),
            name: typeof p.name === 'string' ? p.name : 'Unnamed',
            address: typeof p.address === 'string' ? p.address : null,
            rating: typeof p.rating === 'number' ? p.rating : null,
            rating_count: typeof p.rating_count === 'number' ? p.rating_count : 0,
            google_place_id: typeof p.google_place_id === 'string' ? p.google_place_id : null,
            summary: typeof p.summary === 'string' ? p.summary : '',
            summary_long: typeof p.summary_long === 'string' ? p.summary_long : '',
            about: typeof p.about === 'string' ? p.about : '',
            past_work: typeof p.past_work === 'string' ? p.past_work : '',
            specialisations: Array.isArray(p.specialisations) ? (p.specialisations as string[]) : [],
            highlights: Array.isArray(p.highlights) ? (p.highlights as string[]) : [],
            key_person: typeof p.key_person === 'string' ? p.key_person : '',
            company_size:
                typeof p.company_size === 'string' && ALLOWED_COMPANY_SIZES.has(p.company_size)
                    ? (p.company_size as 'solo' | 'small' | 'mid' | 'large')
                    : null,
            company_size_source:
                typeof p.company_size_source === 'string' ? p.company_size_source : null,
            years_in_business:
                typeof p.years_in_business === 'number' ? p.years_in_business : null,
            years_in_business_source:
                typeof p.years_in_business_source === 'string'
                    ? p.years_in_business_source
                    : null,
            certifications: certsByProviderId.get(String(p.id)) ?? [],
            enrichment_review_required: Boolean(p.enrichment_review_required),
            enrichment_last_failure:
                typeof p.enrichment_last_failure === 'string' ? p.enrichment_last_failure : null,
            enrichment_last_failure_at:
                typeof p.enrichment_last_failure_at === 'string' ? p.enrichment_last_failure_at : null,
            output_count: c.outputs,
            contact_count: c.contacts,
            profile_view_count: c.profileViews,
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
            { status: 400 }
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
    if ('specialisations' in body) {
        if (!Array.isArray(body.specialisations)) {
            return NextResponse.json({ error: 'specialisations must be an array of strings' }, { status: 400 });
        }
        patch.specialisations = body.specialisations
            .filter((x: unknown): x is string => typeof x === 'string')
            .map((s: string) => s.trim())
            .filter(Boolean);
    }
    if ('highlights' in body) {
        if (!Array.isArray(body.highlights)) {
            return NextResponse.json({ error: 'highlights must be an array of strings' }, { status: 400 });
        }
        patch.highlights = body.highlights
            .filter((x: unknown): x is string => typeof x === 'string')
            .map((s: string) => s.trim())
            .filter(Boolean);
    }

    // Filter v2 admin overrides — admin source is sticky and never overwritten by enrichment.
    let companySizeOverride: 'solo' | 'small' | 'mid' | 'large' | null | undefined;
    if ('company_size' in body) {
        const cs = body.company_size;
        if (cs === null || cs === '') {
            patch.company_size = null;
            patch.company_size_source = null;
            companySizeOverride = null;
        } else if (typeof cs === 'string' && ALLOWED_COMPANY_SIZES.has(cs)) {
            patch.company_size = cs;
            patch.company_size_source = 'admin';
            companySizeOverride = cs as 'solo' | 'small' | 'mid' | 'large';
        } else {
            return NextResponse.json(
                { error: 'company_size must be one of solo, small, mid, large or null' },
                { status: 400 }
            );
        }
    }

    if ('years_in_business' in body) {
        const yib = body.years_in_business;
        if (yib === null || yib === '') {
            patch.years_in_business = null;
            patch.years_in_business_source = null;
        } else if (typeof yib === 'number' && Number.isFinite(yib) && yib >= 0 && yib <= 200) {
            patch.years_in_business = Math.floor(yib);
            patch.years_in_business_source = 'admin';
        } else {
            return NextResponse.json(
                { error: 'years_in_business must be a number between 0 and 200, or null' },
                { status: 400 }
            );
        }
    }

    let certificationSlugs: string[] | null = null;
    if ('certifications' in body) {
        if (!Array.isArray(body.certifications)) {
            return NextResponse.json(
                { error: 'certifications must be an array of slugs' },
                { status: 400 }
            );
        }
        const validSlugSet = new Set(CERTIFICATION_SLUGS as readonly string[]);
        const cleaned: string[] = [];
        for (const slug of body.certifications) {
            if (typeof slug !== 'string') continue;
            const lower = slug.trim().toLowerCase();
            if (!validSlugSet.has(lower)) {
                return NextResponse.json(
                    { error: `Unknown certification slug: ${slug}` },
                    { status: 400 }
                );
            }
            if (!cleaned.includes(lower)) cleaned.push(lower);
        }
        certificationSlugs = cleaned;
    }

    const meaningfulKeys = Object.keys(patch).filter((k) => k !== 'updated_at');
    if (meaningfulKeys.length === 0 && certificationSlugs === null) {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const admin = await createSupabaseAdminClient();
    if (meaningfulKeys.length > 0) {
        const { error } = await admin.from('providers').update(patch).eq('id', id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (certificationSlugs !== null) {
        // Wipe admin-source rows then upsert the new admin-managed set. Enrichment-source
        // rows are kept untouched unless they conflict with an admin-set slug (we'll let
        // unique(provider_id, slug) handle that — admin rows take precedence on upsert).
        const { error: delErr } = await admin
            .from('provider_certifications')
            .delete()
            .eq('provider_id', id)
            .eq('source', 'admin');
        if (delErr) {
            return NextResponse.json({ error: delErr.message }, { status: 500 });
        }
        if (certificationSlugs.length > 0) {
            const rows = certificationSlugs
                .map((slug) => {
                    const entry = getCertificationBySlug(slug);
                    if (!entry) return null;
                    return {
                        provider_id: id,
                        slug: entry.slug,
                        label: entry.label,
                        issuer: entry.issuer || null,
                        source: 'admin' as const,
                    };
                })
                .filter(Boolean) as Array<{
                provider_id: string;
                slug: string;
                label: string;
                issuer: string | null;
                source: 'admin';
            }>;
            if (rows.length > 0) {
                const { error: upErr } = await admin
                    .from('provider_certifications')
                    .upsert(rows, { onConflict: 'provider_id,slug' });
                if (upErr) {
                    return NextResponse.json({ error: upErr.message }, { status: 500 });
                }
            }
        }
    }

    return NextResponse.json({ ok: true, company_size: companySizeOverride });
}
