import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';
import { isCacheStale, refreshCachedProvider } from '@/lib/refresh-provider-cache';
import { formatBusinessName } from '@/lib/utils';
import { analyseReviewsForProPage, getAboutCompany } from '@/lib/ai-review-metrics';
import type { ReviewCategory } from '@/lib/ai-review-metrics';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AppHeader } from '@/components/app-header';
import { FavouriteButton } from '@/components/favourite-button';
import { ProviderDirectionsMap } from '../_components/provider-directions-map';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ProviderAboutSection } from '../_components/provider-about-section';
import { ProviderReviewsSection } from '../_components/provider-reviews-section';
import { StarFill } from '@/lib/icons';

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
        notFound();
    }

    const mapsKey =
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;

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

        const primaryLocation = provider.locations[0] ?? null;

        const mapsUrl =
            primaryLocation &&
            (primaryLocation.latitude != null && primaryLocation.longitude != null
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      `${primaryLocation.latitude},${primaryLocation.longitude}`,
                  )}`
                : primaryLocation.address
                  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(primaryLocation.address)}`
                  : null);

        const { data: gallery } = await supabase
            .from('gallery_uploads')
            .select('id, url, title, description')
            .eq('provider_profile_slug', providerProfile.slug)
            .order('created_at', { ascending: false })
            .limit(8);

        const { data: reviews } = await supabase
            .from('customer_reviews')
            .select('id, rating, title, body, created_at, reviewer_name')
            .eq('provider_profile_slug', providerProfile.slug)
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .limit(4);

        // Global favourites count for this Scandio Pro profile
        let favouritesTotal = 0;
        try {
            const admin = await createSupabaseAdminClient();
            const { count } = await admin
                .from('provider_favourites')
                .select('id', { count: 'exact', head: true })
                .eq('provider_profile_slug', providerProfile.slug);
            favouritesTotal = count ?? 0;
        } catch (e) {
            console.warn('Pro page: favourites count (profile) failed', (e as Error).message);
        }

        const profileSummary =
            provider.ai_review_summary ??
            provider.short_description ??
            provider.main_description ??
            null;

        const operatingHoursForProfile: string[] = [
            'Monday: 08:00 – 17:00',
            'Tuesday: 08:00 – 17:00',
            'Wednesday: 08:00 – 17:00',
            'Thursday: 08:00 – 17:00',
            'Friday: 08:00 – 16:00',
            'Saturday: 09:00 – 13:00',
            'Sunday: Closed',
        ];

        const coverageDescription =
            primaryLocation && primaryLocation.address
                ? `Serving areas around ${primaryLocation.address}${
                      primaryLocation.service_radius_km
                          ? ` • ~${primaryLocation.service_radius_km}km radius`
                          : ''
                  }`
                : null;

        const mapConfig =
            mapsKey && primaryLocation
                ? {
                      apiKey: mapsKey,
                      provider: {
                          name: provider.display_name,
                          latitude: primaryLocation.latitude,
                          longitude: primaryLocation.longitude,
                          address: primaryLocation.address,
                      },
                      mapsUrl,
                  }
                : null;

        return (
            <div className="flex min-h-screen flex-col bg-background">
                <AppHeader showBack />
                <main className="mx-auto flex-1 max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
                    <section className="space-y-4">
                        <div className="relative w-full rounded-xl bg-secondary/60 p-4 sm:p-6">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                                <Avatar className="h-14 w-14 sm:h-16 sm:w-16 bg-background text-foreground">
                                    <AvatarFallback className="text-base font-semibold">
                                        {provider.display_name
                                            ?.split(' ')
                                            .map((n: string) => n[0])
                                            .join('')
                                            .slice(0, 2)
                                            .toUpperCase() || 'SP'}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex flex-1 flex-col gap-2">
                                    <div className="flex flex-col gap-1">
                                        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                                            {provider.display_name}
                                        </h1>
                                        {primaryLocation?.address && (
                                            <p className="text-sm text-muted-foreground sm:text-base">
                                                {primaryLocation.address}
                                            </p>
                                        )}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                        <Badge variant="secondary" className="text-xs font-medium">
                                            Scandio Pro
                                        </Badge>
                                        {provider.total_jobs_completed != null && (
                                            <Badge
                                                variant="outline"
                                                className="text-xs font-medium"
                                            >
                                                {provider.total_jobs_completed} jobs completed
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col items-start gap-2 sm:items-end">
                                    <FavouriteButton
                                        providerProfileSlug={providerProfile.slug}
                                        providerName={provider.display_name}
                                        variant="icon"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        {favouritesTotal === 1
                                            ? 'Saved by 1 person'
                                            : `Saved by ${favouritesTotal} people`}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {profileSummary && (
                            <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
                                {profileSummary}
                            </p>
                        )}
                    </section>

                    <Tabs defaultValue="about" className="w-full">
                        <TabsList className="w-full">
                            <TabsTrigger value="about" className="flex-1">
                                About
                            </TabsTrigger>
                            <TabsTrigger value="reviews" className="flex-1">
                                Reviews
                            </TabsTrigger>
                            <TabsTrigger value="gallery" className="flex-1">
                                Gallery
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="about" className="pt-4">
                            <ProviderAboutSection
                                name={provider.display_name}
                                address={primaryLocation?.address ?? null}
                                summary={profileSummary}
                                services={
                                    Array.isArray(provider.service_categories)
                                        ? provider.service_categories
                                        : []
                                }
                                operatingHours={operatingHoursForProfile}
                                coverageDescription={coverageDescription}
                                mapConfig={mapConfig}
                            />
                        </TabsContent>

                        <TabsContent value="reviews" className="pt-4">
                            <ProviderReviewsSection
                                mode="profile"
                                providerName={provider.display_name}
                                providerProfileSlug={providerProfile.slug}
                                placeId={provider.google_place_id ?? null}
                                initialCustomerReviews={reviews ?? []}
                                reviewSummary={profileSummary}
                                profileMetrics={{
                                    punctuality: provider.metrics_punctuality ?? null,
                                    cleanliness: provider.metrics_tidiness ?? null,
                                    professionalism: provider.metrics_professionalism ?? null,
                                    categoriesAccuracy: provider.metrics_cleanup ?? null,
                                }}
                                reviewCategories={{}}
                                googleReviews={[]}
                            />
                        </TabsContent>

                        <TabsContent value="gallery" className="pt-4">
                            {gallery && gallery.length > 0 ? (
                                <section>
                                    <Card className="border-border/70 bg-card">
                                        <CardHeader className="space-y-1 pb-3">
                                            <h2 className="text-sm font-semibold tracking-tight text-foreground">
                                                Gallery
                                            </h2>
                                        </CardHeader>
                                        <CardContent className="space-y-3">
                                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                                {gallery.map((item) => (
                                                    <div
                                                        key={item.id}
                                                        className="overflow-hidden rounded-md border border-border/60 bg-muted"
                                                    >
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={item.url}
                                                            alt={item.title || 'Gallery image'}
                                                            className="h-28 w-full object-cover sm:h-32"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </section>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    No gallery images have been added for this provider yet.
                                </p>
                            )}
                        </TabsContent>
                    </Tabs>
                </main>
            </div>
        );
    }

    // 2. Try cached provider (Google place): by place_id first (stable), then by id (UUID)
    const cacheSelect =
        'place_id, name, address, rating, rating_count, phone, website, summary, services, latitude, longitude, reviews, weekday_descriptions, photos, review_highlights, ai_review_summary, last_updated';
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
    const reviewsFromCache = Array.isArray(cached.reviews)
        ? (cached.reviews as Array<{ text: string; rating: number | null; relativePublishTimeDescription?: string | null; authorName?: string | null }>).map((r) => ({ ...r, authorName: r.authorName ?? 'Google user' }))
        : [];
    const reviewsFromFresh = Array.isArray(freshData?.reviews) ? freshData!.reviews : [];
    const reviewsToUse =
        reviewsFromCache.length > 0 ? reviewsFromCache : reviewsFromFresh;
    const weekdayDescriptionsToUse =
        (Array.isArray(cached.weekday_descriptions) && cached.weekday_descriptions.length > 0)
            ? (cached.weekday_descriptions as string[])
            : (freshData?.weekday_descriptions ?? []);

    const geminiKey = process.env.GEMINI_API_KEY;
    let reviewsSummary: string | null = (cached as any).ai_review_summary ?? null;
    let reviewCategories: Partial<Record<ReviewCategory, number[]>> = {};
    let reviewHighlights: string[] = [];
    let aboutCompany: string | null = null;

    if (reviewsToUse.length > 0 && geminiKey && !reviewsSummary) {
        try {
            const analysis = await analyseReviewsForProPage(
                reviewsToUse.map((r) => ({ text: r.text, rating: r.rating })),
                geminiKey
            );
            reviewsSummary = analysis.summary;
            reviewCategories = analysis.reviewCategories;
            reviewHighlights = analysis.highlights ?? [];
            const updatePayload: { review_highlights?: string[]; ai_review_summary?: string } = {};
            if (reviewHighlights.length > 0) {
                updatePayload.review_highlights = reviewHighlights;
            }
            if (reviewsSummary) {
                updatePayload.ai_review_summary = reviewsSummary;
            }
            if (Object.keys(updatePayload).length > 0) {
                await supabase
                    .from('cached_providers')
                    .update(updatePayload)
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

    // Global favourites count for this cached provider (by place_id)
    let favouritesTotal = 0;
    try {
        const admin = await createSupabaseAdminClient();
        const { count } = await admin
            .from('provider_favourites')
            .select('id', { count: 'exact', head: true })
            .eq('place_id', cached.place_id);
        favouritesTotal = count ?? 0;
    } catch (e) {
        console.warn('Pro page: favourites count (cached) failed', (e as Error).message);
    }

    const placeIdForMaps = (cached.place_id || '').replace(/^places\//, '');
    const mapQuery =
        cached.latitude != null && cached.longitude != null
            ? `${cached.latitude},${cached.longitude}`
            : [cached.name, cached.address].filter(Boolean).join(' ');
    const mapsUrl =
        placeIdForMaps && mapQuery
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  mapQuery,
              )}&query_place_id=${encodeURIComponent(placeIdForMaps)}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  mapQuery || 'Cape Town',
              )}`;

    const primaryAddress = cached.address || null;
    const ratingText =
        cached.rating != null
            ? `${cached.rating.toFixed(1)}${cached.rating_count ? ` (${cached.rating_count} reviews)` : ''}`
            : null;

    const { data: gallery } = await supabase
        .from('gallery_uploads')
        .select('id, url, title, description')
        .eq('place_id', cached.place_id)
        .order('created_at', { ascending: false })
        .limit(8);

    const aboutSummary =
        reviewsSummary || aboutCompany || cached.summary || null;

    const servicesForCached: string[] = Array.isArray(cached.services)
        ? (
              cached.services as Array<{
                  short?: string;
                  full?: string;
              }>
          )
              .map((s) => s.full || s.short)
              .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        : [];

    const operatingHoursForCached: string[] = weekdayDescriptionsToUse;

    const mapConfigForCached =
        mapsKey && mapQuery
            ? {
                  apiKey: mapsKey,
                  provider: {
                      name: cached.name,
                      latitude: cached.latitude,
                      longitude: cached.longitude,
                      address: cached.address,
                  },
                  mapsUrl,
              }
            : null;

    const placeIdForReviews = cached.place_id;
    const fullStars = cached.rating != null ? Math.round(cached.rating) : 0;
    const totalStars = 5;

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <AppHeader showBack />
            <main className="mx-auto flex-1 w-full max-w-7xl space-y-6 px-0 py-6 sm:px-6 lg:px-8">
                <section className="flex flex-col gap-6 px-4 sm:px-0">
                    <div className="w-full h-48 sm:h-96 rounded-lg border border-input/50 bg-secondary/50" />
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-row justify-between items-center">
                            <div className="flex flex-row items-center gap-3">
                                <div className="flex flex-row items-center gap-1.5">
                                    {Array.from({ length: totalStars }).map((_, i) => (
                                        <StarFill
                                            key={i}
                                            className={`size-4 ${i < fullStars ? 'text-yellow-500' : 'text-muted-foreground/20'}`}
                                            aria-hidden
                                        />
                                    ))}
                                </div>
                                <p className="text-sm font-medium text-foreground">
                                    {cached.rating != null ? cached.rating.toFixed(1) : '—'}
                                    {cached.rating_count ? (
                                        <span className="ml-1 text-xs text-muted-foreground">
                                            ({cached.rating_count} Ratings)
                                        </span>
                                    ) : null}
                                </p>
                            </div>
                            <div className="flex flex-row items-center gap-3">
                                <FavouriteButton
                                    placeId={cached.place_id}
                                    providerProfileSlug={null}
                                    providerName={cached.name}
                                    variant="icon"
                                />
                                <p className="text-sm text-muted-foreground">
                                    {favouritesTotal === 1
                                        ? '1 Favourite'
                                        : `${favouritesTotal} Favourites`}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-row flex-wrap items-center gap-2 justify-between">
                            <div className="flex flex-wrap items-center gap-3">
                                <h1 className="text-xl font-semibold sm:font-bold sm:text-2xl leading-tight tracking-tight">
                                    {formatBusinessName(cached.name)}
                                </h1>
                                <Badge variant="outline">
                                    Verify
                                </Badge>
                            </div>
                        </div>
                        {servicesForCached.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {servicesForCached.slice(0, 8).map((service) => (
                                    <Badge key={service} variant="secondary">
                                        {service}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>
                    {aboutSummary && (
                        <p className="text-sm text-muted-foreground">{aboutSummary}</p>
                    )}

                    <Tabs defaultValue="about" className="w-full">
                        <TabsList className="w-full">
                            <TabsTrigger value="about" className="flex-1">
                                About
                            </TabsTrigger>
                            <TabsTrigger value="reviews" className="flex-1">
                                Reviews
                            </TabsTrigger>
                            <TabsTrigger value="gallery" className="flex-1">
                                Gallery
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="about" className="pt-4">
                            <ProviderAboutSection
                                name={cached.name}
                                address={primaryAddress}
                                summary={aboutSummary}
                                services={servicesForCached}
                                operatingHours={operatingHoursForCached}
                                coverageDescription={primaryAddress}
                                mapConfig={mapConfigForCached}
                            />
                        </TabsContent>

                        <TabsContent value="reviews" className="pt-4">
                            <ProviderReviewsSection
                                mode="cached"
                                providerName={cached.name}
                                providerProfileSlug={null}
                                placeId={placeIdForReviews}
                                initialCustomerReviews={[]}
                                reviewSummary={reviewsSummary}
                                profileMetrics={null}
                                reviewCategories={reviewCategories}
                                googleReviews={reviewsToUse}
                            />
                        </TabsContent>

                        <TabsContent value="gallery" className="pt-4">
                            {gallery && gallery.length > 0 ? (
                                <section>
                                    <Card className="border-border/70 bg-card">
                                        <CardHeader className="space-y-1 pb-3">
                                            <h2 className="text-sm font-semibold tracking-tight text-foreground">
                                                Gallery
                                            </h2>
                                        </CardHeader>
                                        <CardContent className="space-y-3">
                                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                                {gallery.map((item) => (
                                                    <div
                                                        key={item.id}
                                                        className="overflow-hidden rounded-md border border-border/60 bg-muted"
                                                    >
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={item.url}
                                                            alt={item.title || 'Gallery image'}
                                                            className="h-28 w-full object-cover sm:h-32"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </section>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    No gallery images have been added for this provider yet.
                                </p>
                            )}
                        </TabsContent>
                    </Tabs>
                </section>
            </main>
        </div>
    );
}
