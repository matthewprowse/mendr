import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { isCacheStale, refreshCachedProvider } from '@/lib/refresh-provider-cache';
import { formatBusinessName } from '@/lib/utils';
import { analyseReviewsForProPage, getAboutCompany } from '@/lib/ai-review-metrics';
import type { ReviewCategory } from '@/lib/ai-review-metrics';
import Link from 'next/link';
import NextImage from 'next/image';
import { ProviderPageClient } from './_components/provider-page-client';
import { ProviderPlaceClient } from './_components/provider-place-client';
import { ProPlaceHeader } from './_components/pro-place-header';

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const decoded = decodeURIComponent(id);
    if (!decoded.trim()) return { title: 'Provider | Scandio' };
    try {
        const supabase = await createSupabaseServerClient();
        const { data: profile } = await supabase
            .from('provider_profiles')
            .select('short_description')
            .eq('id', decoded)
            .maybeSingle();
        if (profile?.short_description) {
            return { title: 'Scandio Pro', description: profile.short_description };
        }
        const { data: cached } = await supabase
            .from('cached_providers')
            .select('name')
            .eq('id', decoded)
            .maybeSingle();
        const title = cached?.name ? `Scandio: ${formatBusinessName(cached.name)}` : 'Provider | Scandio';
        return { title };
    } catch {
        return { title: 'Provider | Scandio' };
    }
}

export default async function ProviderIdPage({ params }: PageProps) {
    const { id } = await params;
    const decoded = decodeURIComponent(id);
    if (!decoded.trim()) redirect('/');

    let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
    try {
        supabase = await createSupabaseServerClient();
    } catch (e) {
        console.error('Pro page: Supabase client failed', e);
        throw e;
    }

    // 1. Try Scandio provider profile by id
    const { data: providerProfile, error } = await supabase
        .from('provider_profiles')
        .select(
            'id, slug, banner_url, short_description, main_description, service_categories, google_place_id, ai_review_summary, positives, negatives, metrics_punctuality, metrics_tidiness, metrics_professionalism, metrics_cleanup, total_jobs_completed, updated_at'
        )
        .eq('id', decoded)
        .maybeSingle();

    if (!error && providerProfile) {
        let displayName = providerProfile.slug?.replace(/-/g, ' ') ?? 'Pro';
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('first_name, surname')
                .eq('id', providerProfile.id)
                .maybeSingle();
            if (profile?.first_name || profile?.surname) {
                displayName = [profile.first_name, profile.surname].filter(Boolean).join(' ');
            }
        } catch {
            // ignore
        }

        const { data: locations } = await supabase
            .from('provider_locations')
            .select('id, nickname, address, latitude, longitude, service_radius_km')
            .eq('provider_id', providerProfile.id)
            .eq('is_active', true);

        const provider = {
            ...providerProfile,
            display_name: displayName,
            locations: locations ?? [],
        };

        return (
            <div className="min-h-screen bg-background">
                <header className="sticky top-0 z-50 bg-background">
                    <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6 lg:px-8">
                        <Link href="/" className="flex items-center gap-2">
                            <NextImage src="/logo.svg" alt="Scandio" width={36} height={36} className="h-9 w-9 shrink-0 rounded-lg" />
                            <span className="font-semibold">Scandio</span>
                        </Link>
                        <span className="truncate font-semibold text-foreground px-4 flex-1 text-center">
                            {displayName}
                        </span>
                        <Link href="/" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground shrink-0">
                            Back
                        </Link>
                    </div>
                </header>
                <main className="mx-auto max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
                    <ProviderPageClient provider={provider} />
                </main>
            </div>
        );
    }

    // 2. Try cached provider (Google place): by place_id first (stable), then by id (UUID)
    const cacheSelect = 'place_id, name, address, rating, rating_count, phone, website, summary, services, latitude, longitude, reviews, weekday_descriptions, photos, review_highlights, last_updated';
    const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded);
    let { data: cached } = await supabase
        .from('cached_providers')
        .select(cacheSelect)
        .eq('place_id', decoded)
        .maybeSingle();

    if (!cached && decoded.startsWith('places/') === false) {
        const { data: byPlace } = await supabase
            .from('cached_providers')
            .select(cacheSelect)
            .eq('place_id', `places/${decoded}`)
            .maybeSingle();
        if (byPlace) cached = byPlace;
    }
    if (!cached && looksLikeUuid) {
        const { data: byId } = await supabase
            .from('cached_providers')
            .select(cacheSelect)
            .eq('id', decoded)
            .maybeSingle();
        if (byId) cached = byId;
    }

    // If still missing and param is not a UUID, treat as Google place_id and fetch then cache
    if (!cached && !looksLikeUuid) {
        try {
            const placeIdForFetch = decoded.startsWith('places/') ? decoded : `places/${decoded}`;
            await refreshCachedProvider(placeIdForFetch);
            const { data: afterFetch } = await supabase
                .from('cached_providers')
                .select(cacheSelect)
                .eq('place_id', placeIdForFetch)
                .maybeSingle();
            if (afterFetch) cached = afterFetch;
            if (!cached) {
                const { data: alt } = await supabase
                    .from('cached_providers')
                    .select(cacheSelect)
                    .eq('place_id', decoded)
                    .maybeSingle();
                if (alt) cached = alt;
            }
        } catch (e) {
            console.warn('Pro page: refresh/re-read failed', (e as Error).message);
            // Leave cached null so we show not-found below
        }
    }

    if (!cached) notFound();

    const hasNoReviews =
        !cached.reviews || (Array.isArray(cached.reviews) && cached.reviews.length === 0);
    const hasNoHours =
        !cached.weekday_descriptions ||
        (Array.isArray(cached.weekday_descriptions) && cached.weekday_descriptions.length === 0);
    const hasNoPhotos =
        !cached.photos || (Array.isArray(cached.photos) && cached.photos.length === 0);
    let freshData: Awaited<ReturnType<typeof refreshCachedProvider>> | null = null;
    if (isCacheStale(cached.last_updated) || hasNoReviews || hasNoHours || hasNoPhotos) {
        freshData = await refreshCachedProvider(cached.place_id);
        const { data: refreshed } = await supabase
            .from('cached_providers')
            .select(cacheSelect)
            .eq('place_id', cached.place_id)
            .maybeSingle();
        if (refreshed) cached = refreshed;
    }
    // Use freshly fetched reviews/hours when cache still has none (e.g. DB write failed or re-read was stale)
    const reviewsFromCache = (cached.reviews as Array<{ text: string; rating: number | null; relativePublishTimeDescription?: string | null; authorName?: string | null }>) ?? [];
    const reviewsFromFresh = freshData?.reviews ?? [];
    const reviewsToUse =
        (Array.isArray(cached.reviews) && cached.reviews.length > 0)
            ? reviewsFromCache.map((r) => ({ ...r, authorName: r.authorName ?? 'Google user' }))
            : reviewsFromFresh;
    const weekdayDescriptionsToUse =
        (Array.isArray(cached.weekday_descriptions) && cached.weekday_descriptions.length > 0)
            ? (cached.weekday_descriptions as string[])
            : (freshData?.weekday_descriptions ?? []);

    const geminiKey = process.env.GEMINI_API_KEY;
    let reviewsSummary: string | null = null;
    let reviewCategories: Partial<Record<ReviewCategory, number[]>> = {};
    let reviewHighlights: string[] = [];
    let aboutCompany: string | null = null;

    if (reviewsToUse.length > 0 && geminiKey) {
        try {
            const analysis = await analyseReviewsForProPage(
                reviewsToUse.map((r) => ({ text: r.text, rating: r.rating })),
                geminiKey
            );
            reviewsSummary = analysis.summary;
            reviewCategories = analysis.reviewCategories;
            reviewHighlights = analysis.highlights ?? [];
            if (reviewHighlights.length > 0) {
                await supabase
                    .from('cached_providers')
                    .update({ review_highlights: reviewHighlights })
                    .eq('place_id', cached.place_id);
            }
        } catch (e) {
            console.warn('Pro page: review analysis failed', (e as Error).message);
        }
    }

    if (geminiKey && (cached.summary || (cached.services as Array<{ short?: string; full?: string }>)?.length)) {
        try {
            aboutCompany = await getAboutCompany(
                cached.name,
                cached.summary ?? null,
                (cached.services as Array<{ short?: string; full?: string }>) ?? [],
                geminiKey
            );
        } catch (e) {
            console.warn('Pro page: about company failed', (e as Error).message);
        }
    }

    const placeIdForMaps = (cached.place_id || '').replace(/^places\//, '');
    const mapQuery =
        cached.latitude != null && cached.longitude != null
            ? `${cached.latitude},${cached.longitude}`
            : [cached.name, cached.address].filter(Boolean).join(' ');
    // Maps search requires query (name/address/coords); use query_place_id for precise place (not query=place_id:...)
    const mapsUrl =
        placeIdForMaps && mapQuery
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}&query_place_id=${encodeURIComponent(placeIdForMaps)}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery || 'Cape Town')}`;

    const placeProvider = {
        place_id: cached.place_id,
        name: cached.name,
        address: cached.address ?? null,
        rating: cached.rating != null ? Number(cached.rating) : null,
        rating_count: cached.rating_count ?? null,
        phone: cached.phone ?? null,
        website: cached.website ?? null,
        summary: cached.summary ?? null,
        services: (cached.services as Array<{ short?: string; full?: string }>) ?? [],
        latitude: cached.latitude ?? null,
        longitude: cached.longitude ?? null,
        reviews: reviewsToUse,
        weekday_descriptions: weekdayDescriptionsToUse,
        photos: (cached.photos as Array<{ name: string }>) ?? [],
        reviewsSummary: reviewsSummary ?? undefined,
        reviewCategories: Object.keys(reviewCategories).length ? reviewCategories : undefined,
        reviewHighlights: (cached.review_highlights as string[] | null) ?? (reviewHighlights.length ? reviewHighlights : undefined),
        aboutCompany: aboutCompany ?? undefined,
        social: {} as { instagram?: string; facebook?: string },
    };

    return (
        <div className="min-h-screen bg-background">
            <ProPlaceHeader
                provider={{
                    name: placeProvider.name,
                    phone: placeProvider.phone,
                    website: placeProvider.website,
                    place_id: placeProvider.place_id,
                    latitude: placeProvider.latitude,
                    longitude: placeProvider.longitude,
                }}
                mapsUrl={mapsUrl}
                weekdayDescriptions={weekdayDescriptionsToUse}
            />
            <main className="mx-auto max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
                <ProviderPlaceClient provider={placeProvider} mapsUrl={mapsUrl} />
            </main>
        </div>
    );
}
