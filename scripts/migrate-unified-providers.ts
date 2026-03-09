#!/usr/bin/env npx tsx
/**
 * One-off migration helper: backfill unified `providers`, `reviews`, `provider_images`
 * from legacy tables (`cached_providers`, `customer_reviews`) and Scandio pro tables.
 *
 * Usage:
 *   npm run dev (optional)
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... npx tsx app/scripts/migrate-unified-providers.ts
 *
 * Notes:
 * - This script is idempotent (uses upserts / unique constraints).
 * - It does NOT delete legacy tables.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const cwd = process.cwd();
config({ path: resolve(cwd, '.env') });
config({ path: resolve(cwd, '.env.local') });

function getSupabase(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
        throw new Error(
            'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
        );
    }
    return createClient(url, key);
}

function normalizePlacesId(id: string | null | undefined): string | null {
    if (!id) return null;
    const trimmed = String(id).trim();
    if (!trimmed) return null;
    return trimmed.startsWith('places/') ? trimmed : `places/${trimmed.replace(/^places\//, '')}`;
}

async function backfillGoogleProviders(supabase: SupabaseClient) {
    console.log('Backfilling Google providers from cached_providers → providers...');
    const { data: rows, error } = await supabase.from('cached_providers').select('*');
    if (error) throw new Error(`cached_providers select failed: ${error.message}`);

    const payload = (rows ?? []).map((r: any) => ({
        id: r.id, // preserve legacy id so /pro/[id] keeps working
        source: 'google',
        google_place_id: normalizePlacesId(r.place_id),
        name: r.name,
        address: r.address ?? null,
        rating: r.rating ?? null,
        rating_count: r.rating_count ?? null,
        phone: r.phone ?? null,
        website: r.website ?? null,
        latitude: r.latitude ?? null,
        longitude: r.longitude ?? null,
        summary: r.summary ?? null,
        services: r.services ?? [],
        last_updated: r.last_updated ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }));

    if (payload.length === 0) return 0;
    const { error: upsertErr } = await supabase.from('providers').upsert(payload, {
        onConflict: 'google_place_id',
    });
    if (upsertErr) throw new Error(`providers upsert failed: ${upsertErr.message}`);
    return payload.length;
}

async function backfillScandioProviders(supabase: SupabaseClient) {
    console.log('Backfilling Scandio providers from provider_profiles → providers...');
    const { data: profiles, error } = await supabase
        .from('provider_profiles')
        .select('id, slug, google_place_id, short_description, main_description, updated_at');
    if (error) throw new Error(`provider_profiles select failed: ${error.message}`);

    // Fetch names from profiles table
    const ids = (profiles ?? []).map((p: any) => p.id).filter(Boolean);
    const { data: people } = ids.length
        ? await supabase.from('profiles').select('id, first_name, surname').in('id', ids)
        : { data: [] };
    const nameById = new Map<string, string>(
        (people ?? []).map((p: any) => [
            p.id,
            [p.first_name, p.surname].filter(Boolean).join(' ').trim() || 'Pro',
        ])
    );

    const payload = (profiles ?? []).map((p: any) => ({
        id: p.id, // preserve profile id so /pro/[id] still resolves to profile path
        source: 'scandio',
        google_place_id: normalizePlacesId(p.google_place_id),
        profile_id: p.id,
        slug: p.slug,
        name: nameById.get(p.id) || p.slug?.replace(/-/g, ' ') || 'Pro',
        summary: p.short_description ?? p.main_description ?? null,
        last_updated: p.updated_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }));

    if (payload.length === 0) return 0;
    const { error: upsertErr } = await supabase.from('providers').upsert(payload, {
        onConflict: 'profile_id',
    });
    if (upsertErr) throw new Error(`providers upsert (scandio) failed: ${upsertErr.message}`);
    return payload.length;
}

async function backfillCustomerReviews(supabase: SupabaseClient) {
    console.log('Backfilling customer_reviews → reviews (source=scandio)...');
    const { data: rows, error } = await supabase.from('customer_reviews').select('*');
    if (error) throw new Error(`customer_reviews select failed: ${error.message}`);

    if (!rows || rows.length === 0) return 0;

    // Build provider id lookup for both targets
    const placeIds = Array.from(
        new Set(rows.map((r: any) => normalizePlacesId(r.place_id)).filter(Boolean))
    ) as string[];
    const slugs = Array.from(new Set(rows.map((r: any) => r.provider_profile_slug).filter(Boolean))) as string[];

    const providerIdByPlace = new Map<string, string>();
    if (placeIds.length) {
        const { data: provs } = await supabase.from('providers').select('id, google_place_id').in('google_place_id', placeIds);
        (provs ?? []).forEach((p: any) => {
            if (p.google_place_id) providerIdByPlace.set(p.google_place_id, p.id);
        });
    }
    const providerIdBySlug = new Map<string, string>();
    if (slugs.length) {
        const { data: provs } = await supabase.from('providers').select('id, slug').in('slug', slugs);
        (provs ?? []).forEach((p: any) => {
            if (p.slug) providerIdBySlug.set(p.slug, p.id);
        });
    }

    const payload = rows
        .map((r: any) => {
            const placeId = normalizePlacesId(r.place_id);
            const providerId =
                (placeId ? providerIdByPlace.get(placeId) : null) ||
                (r.provider_profile_slug ? providerIdBySlug.get(r.provider_profile_slug) : null) ||
                null;
            if (!providerId) return null;

            const sourceRef = createHash('sha1')
                .update(['scandio', providerId, r.id].join('|'))
                .digest('hex');
            return {
                provider_id: providerId,
                source: 'scandio',
                source_ref: sourceRef,
                reviewer_user_id: r.user_id ?? null,
                reviewer_name: r.reviewer_name ?? null,
                reviewer_email: r.reviewer_email ?? null,
                rating: r.rating ?? null,
                category_ratings: r.category_ratings ?? null,
                title: r.title ?? null,
                body: r.body ?? '',
                image_urls: r.image_urls ?? [],
                status: r.status ?? 'approved',
                published_at: r.created_at ?? null,
                raw: null,
                updated_at: new Date().toISOString(),
            };
        })
        .filter(Boolean);

    if (payload.length === 0) return 0;
    const { error: upsertErr } = await supabase.from('reviews').upsert(payload, {
        onConflict: 'source,source_ref',
    });
    if (upsertErr) throw new Error(`reviews upsert failed: ${upsertErr.message}`);
    return payload.length;
}

async function main() {
    const supabase = getSupabase();
    const googleProviders = await backfillGoogleProviders(supabase);
    console.log(`  ✓ providers from cached_providers: ${googleProviders}`);

    const scandioProviders = await backfillScandioProviders(supabase);
    console.log(`  ✓ providers from provider_profiles: ${scandioProviders}`);

    const reviews = await backfillCustomerReviews(supabase);
    console.log(`  ✓ reviews from customer_reviews: ${reviews}`);

    console.log('Done.');
}

main().catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
});

