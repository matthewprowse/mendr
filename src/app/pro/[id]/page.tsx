// @ts-nocheck
import React from 'react';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import ProLegacyPage from '../page';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { refreshProviderByPlaceId } from '@/lib/refresh-provider-by-place-id';
import { generateProviderSummaries } from '@/lib/provider-summaries';
import { AppHeader } from '@/components/app-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { ProPageMap } from './_components/pro-page-map';
import { ProStickyFooter } from './_components/pro-sticky-footer';
import { ProReviewForm } from './_components/pro-review-form';
import { ProGalleryUpload } from './_components/pro-gallery-upload';
import { refreshProviderWebsiteById } from '@/lib/refresh-provider-website';
import { getOpenStatusTextFromWeekdayDescriptions } from '@/lib/open-status';
import { formatWeekdayDescriptionsTo24h } from '@/lib/format-weekday-descriptions';

type PageProps = {
    params: Promise<{ id: string }>;
};

function formatReviewDate(value: string | null | undefined): string | null {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function renderStarRow(rating: number | null | undefined, max = 5) {
    if (typeof rating !== 'number' || rating <= 0) return null;
    const rounded = Math.round(rating);
    const stars = [];
    for (let i = 1; i <= max; i += 1) {
        const filled = i <= rounded;
        stars.push(
            <span
                key={i}
                className={filled ? 'text-yellow-400' : 'text-muted-foreground'}
                aria-hidden="true"
            >
                ★
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 text-xs">
            <span className="inline-flex items-center gap-0.5">{stars}</span>
            <span className="text-muted-foreground">({rating.toFixed(1)})</span>
        </span>
    );
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default async function ProPage({ params }: PageProps) {
    const rawId = (await params).id;
    const id = typeof rawId === 'string' ? decodeURIComponent(rawId).trim() : '';

    if (!id) {
        notFound();
    }

    // Render the existing legacy PRO UI as the /pro/[id] page.
    // The legacy UI will extract `placeId` from the pathname (not query params).
    return <ProLegacyPage />;

    const supabase = await createSupabaseServerClient();

    let provider: any | null = null;

    // 1. Try direct lookup by internal UUID (unified providers.id).
    if (isUuid(id)) {
        const { data } = await supabase.from('providers').select('*').eq('id', id).maybeSingle();
        provider = data ?? null;
    }

    // 2. Fallback: lookup by Google place id (providers.google_place_id).
    if (!provider) {
        const googleId = id.startsWith('places/') ? id : `places/${id}`;
        const { data } = await supabase
            .from('providers')
            .select('*')
            .eq('google_place_id', googleId)
            .maybeSingle();
        provider = data ?? null;
    }

    // 3. If still missing and we have a place id: run the search now — fetch from Google,
    // save to Supabase, then load the provider. Next time someone hits this profile it's ready.
    if (!provider && !isUuid(id)) {
        const refreshResult = await refreshProviderByPlaceId(id);
        if (refreshResult.ok && refreshResult.provider) {
            provider = refreshResult.provider;
        }
    }

    if (!provider) {
        notFound();
    }

    let providerId = (provider as { id?: string }).id;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

    // Backfill gallery from Google when we have a place id but no images yet
    if (
        providerId &&
        provider.google_place_id &&
        !isUuid(id)
    ) {
        const { data: existingImages } = await supabase
            .from('provider_images')
            .select('id')
            .eq('provider_id', providerId)
            .limit(1);
        if (!existingImages?.length) {
            const placeIdForRefresh = (provider.google_place_id as string).replace(/^places\//, '');
            const refreshResult = await refreshProviderByPlaceId(placeIdForRefresh);
            if (refreshResult.ok && refreshResult.provider) {
                provider = refreshResult.provider as typeof provider;
                providerId = (provider as { id?: string }).id;
            }
        }
    }

    let galleryImages: { url: string; caption?: string }[] = [];
    if (providerId && supabaseUrl) {
        const { data: imageRows } = await supabase
            .from('provider_images')
            .select('path, bucket, caption')
            .eq('provider_id', providerId)
            .order('sort_order', { ascending: true });
        if (imageRows?.length) {
            galleryImages = imageRows.map((row: { path: string; bucket?: string; caption?: string | null }) => {
                const bucket = row.bucket || 'gallery';
                return {
                    url: `${supabaseUrl}/storage/v1/object/public/${bucket}/${row.path}`,
                    caption: row.caption ?? undefined,
                };
            });
        }
    }
    const providerPhotos = Array.isArray(provider.photos) ? provider.photos : [];
    if (galleryImages.length === 0 && providerPhotos.length > 0) {
        galleryImages = providerPhotos.map((p: { url?: string; caption?: string }) => ({
            url: p.url || '',
            caption: p.caption,
        })).filter((p: { url: string }) => p.url);
    }

    const coverImage = galleryImages[0] ?? null;

    // JS API key for ProvidersMap (same as match page); fallback to embed key if only one is set
    const mapsApiKey =
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ||
        '';
    const hasCoords =
        typeof provider.latitude === 'number' && typeof provider.longitude === 'number';
    const services: { short?: string; full?: string }[] = Array.isArray(provider.services)
        ? provider.services
        : [];
    const serviceCategories: string[] = Array.isArray(provider.service_categories)
        ? (provider.service_categories as unknown[]).filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        : [];
    const primaryTrade: string | null =
        (provider.primary_trade && String(provider.primary_trade).trim()) ||
        (serviceCategories.length > 0 ? serviceCategories[0] : null);
    // Single list of trade labels for badges and Services & Specialties (from services JSON, service_categories, primary_trade).
    const displayTrades = (() => {
        const raw: string[] = [
            ...services.map((s) => (s.short || s.full || '').trim()).filter(Boolean),
            ...serviceCategories.map((s) => String(s).trim()).filter(Boolean),
            ...(primaryTrade ? [primaryTrade] : []),
        ];
        const filtered = raw.filter((label) => {
            const lower = label.toLowerCase();
            if (lower === 'service' || lower === 'services') return false;
            if (lower === 'supplier' || lower === 'store' || lower === 'shop') return false;
            return true;
        });
        return Array.from(new Set(filtered));
    })();

    const licenses: any[] = Array.isArray(provider.licenses) ? provider.licenses : [];
    const openingHours =
        provider.opening_hours && typeof provider.opening_hours === 'object'
            ? (provider.opening_hours as Record<string, string | null | undefined>)
            : null;
    const weekdayDescriptions = Array.isArray(provider.weekday_descriptions)
        ? (provider.weekday_descriptions as string[]).filter(Boolean)
        : null;
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const operatingHoursList: { day: string; hours: string }[] = openingHours
        ? dayOrder.map((day) => {
            const key = day.slice(0, 3).toLowerCase();
            const value = openingHours[key];
            return value ? { day, hours: value } : null;
          }).filter(Boolean) as { day: string; hours: string }[]
        : weekdayDescriptions
          ? weekdayDescriptions.map((line: string) => {
                const match = line.match(/^(\w+day)\s*[:\-]\s*(.+)$/i);
                return match ? { day: match[1], hours: match[2].trim() } : { day: line, hours: '' };
            }).filter((x) => x.hours)
          : [];

    let reviewSnippets: any[] = Array.isArray(provider.review_snippets)
        ? provider.review_snippets
        : [];
    if (providerId && reviewSnippets.length === 0) {
        const { data: reviewRows } = await supabase
            .from('reviews')
            .select('body, rating, reviewer_name, published_at')
            .eq('provider_id', providerId)
            .eq('source', 'google')
            .eq('status', 'approved')
            .order('published_at', { ascending: false })
            .limit(20);
        if (reviewRows?.length) {
            reviewSnippets = reviewRows.map((r: any) => ({
                text: r.body,
                rating: r.rating,
                author_name: r.reviewer_name,
                published_at: r.published_at,
            }));
        }
    }
    let scandioReviews: any[] = [];
    if (providerId) {
        const { data: scandioRows } = await supabase
            .from('reviews')
            .select('body, rating, reviewer_name, category_ratings, published_at')
            .eq('provider_id', providerId)
            .eq('source', 'scandio')
            .eq('status', 'approved')
            .order('published_at', { ascending: false })
            .limit(20);
        if (scandioRows?.length) {
            scandioReviews = scandioRows.map((r: any) => ({
                text: r.body,
                rating: r.rating,
                author_name: r.reviewer_name,
                category_ratings: r.category_ratings,
                published_at: r.published_at,
            }));
        }
    }
    const scandioUseCases: string[] = Array.isArray(provider.scandio_use_cases)
        ? provider.scandio_use_cases
        : [];

    // Legacy iframe fallback when JS map isn't used (no coords or no API key)
    const embedMapsKey =
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
    const mapEmbedSrc =
        embedMapsKey && (hasCoords || provider.address)
            ? hasCoords
                ? `https://www.google.com/maps/embed/v1/place?key=${embedMapsKey}&q=${provider.latitude},${provider.longitude}`
                : `https://www.google.com/maps/embed/v1/search?key=${embedMapsKey}&q=${encodeURIComponent(
                      provider.address || ''
                  )}`
            : null;
    const directionsHref =
        hasCoords || provider.address
            ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                  hasCoords
                      ? `${provider.latitude},${provider.longitude}`
                      : String(provider.address || '')
              )}`
            : null;

    const ratingText =
        typeof provider.rating === 'number'
            ? provider.rating.toFixed(1)
            : null;

    const reviewCountText =
        typeof provider.rating_count === 'number' && provider.rating_count > 0
            ? `${provider.rating_count} review${provider.rating_count === 1 ? '' : 's'}`
            : null;

    let customerReviewSummary: string =
        (provider.ai_review_summary && String(provider.ai_review_summary).trim()) ||
        (provider.summary && String(provider.summary).trim()) ||
        '';
    let aboutText: string =
        (provider.about && String(provider.about).trim()) ||
        '';
    let pastWorkText: string =
        (provider.past_work && String(provider.past_work).trim()) || '';

    let websiteTextForSummaries: string | undefined;
    if (providerId && provider.website) {
        const websiteResult = await refreshProviderWebsiteById(providerId);
        if (websiteResult.ok && websiteResult.websiteText) {
            websiteTextForSummaries = websiteResult.websiteText;
        }
    }

    const reviewBodies = reviewSnippets.map((r: any) => r.text || '').filter(Boolean);
    const needsGeneratedSummaries =
        (customerReviewSummary.length < 50 || aboutText.length < 50 || !pastWorkText) &&
        reviewBodies.length > 0;
    if (needsGeneratedSummaries) {
        const generated = await generateProviderSummaries({
            name: provider.name,
            primaryTrade: primaryTrade ?? undefined,
            services: displayTrades,
            address: provider.address ?? undefined,
            reviewBodies,
            rating: provider.rating ?? undefined,
            reviewCount: provider.rating_count ?? undefined,
            websiteText: websiteTextForSummaries,
        });
        if (generated) {
            if (customerReviewSummary.length < 50) customerReviewSummary = generated.customerReviewSummary;
            if (aboutText.length < 50) aboutText = generated.aboutBusiness;
            if (!pastWorkText) pastWorkText = generated.pastWork;
        }
    }
    if (!customerReviewSummary) customerReviewSummary = 'No customer review summary available yet.';
    // About this pro: business-only (when founded, what work they do). Never use review summary here.
    if (!aboutText) aboutText = `${provider.name}${primaryTrade ? ` is a ${primaryTrade} business` : ''}. Contact for more information.`;

    const distanceText: string | null =
        typeof provider.distance_text === 'string' && provider.distance_text.trim()
            ? provider.distance_text
            : null;

    let openStatus: string | null = null;
    const formattedWeekdayDescriptions = formatWeekdayDescriptionsTo24h(provider.weekday_descriptions) ?? provider.weekday_descriptions;
    const openStatusResult = getOpenStatusTextFromWeekdayDescriptions(formattedWeekdayDescriptions, new Date());
    if (openStatusResult.isOpen === true) {
        openStatus = 'Open Now';
    } else if (openStatusResult.isOpen === false) {
        openStatus = openStatusResult.nextOpensAt
            ? `Closed · Opens at ${openStatusResult.nextOpensAt}`
            : 'Closed';
    }

    return (
        <main className="flex min-h-screen flex-col bg-background">
            <AppHeader showBack />

            {/* Hero header with cover image, core stats and distance */}
            <section className="w-full border-b border-border bg-background">
                <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pt-4 pb-3">
                    {coverImage && (
                        <div className="relative h-64 w-full overflow-hidden rounded-xl border border-border bg-muted md:h-56">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={coverImage.url}
                                alt={coverImage.caption || `${provider.name} cover photo`}
                                className="h-full w-full object-cover"
                            />
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                            <div className="space-y-1">
                                <h1 className="text-3xl font-bold tracking-tight">
                                    {provider.name}
                                </h1>
                                {(primaryTrade || provider.tagline) && (
                                    <p className="text-sm text-muted-foreground">
                                        {primaryTrade}
                                        {primaryTrade && provider.tagline && ' · '}
                                        {provider.tagline}
                                    </p>
                                )}
                                {(provider.address || distanceText) && (
                                    <p className="text-xs text-muted-foreground">
                                        {provider.address}
                                        {provider.address && distanceText && ' · '}
                                        {distanceText && `${distanceText}`}
                                    </p>
                                )}
                                {(ratingText || reviewCountText) && (
                                    <div className="flex items-center gap-1.5 pt-0.5 text-xs">
                                        {typeof provider.rating === 'number' && renderStarRow(provider.rating)}
                                        {reviewCountText && (
                                            <span className="text-muted-foreground">{reviewCountText}</span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {(ratingText || reviewCountText || openStatus) && (
                                <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
                                    {ratingText && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 font-medium">
                                            <span className="text-yellow-400" aria-hidden="true">
                                                ★
                                            </span>
                                            <span>{ratingText}</span>
                                            {reviewCountText && (
                                                <span className="text-muted-foreground">
                                                    ({reviewCountText})
                                                </span>
                                            )}
                                        </span>
                                    )}
                                    {openStatus && (
                                        <span
                                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                                                openStatus.startsWith('Open')
                                                    ? 'bg-emerald-50 text-emerald-700'
                                                    : 'border border-border text-muted-foreground'
                                            }`}
                                        >
                                            {openStatus}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {displayTrades.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {displayTrades.slice(0, 6).map((label, i) => (
                                    <Badge key={i} variant="secondary" className="rounded-full text-xs font-medium">
                                        {label}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 pb-24">
                <section className="space-y-4">
                    <div className="space-y-4">
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                                    About this pro
                                </p>
                                <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                                    {aboutText}
                                </p>
                            </div>
                                {(licenses.length > 0 ||
                                    provider.insured ||
                                    provider.guarantee_text ||
                                    provider.years_in_business) && (
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                                            Credentials & guarantees
                                        </p>
                                        <div className="space-y-1 text-sm text-foreground">
                                            {licenses.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {licenses.map((licence, i) => (
                                                        <Badge
                                                            key={i}
                                                            variant="outline"
                                                            className="rounded-full text-xs"
                                                        >
                                                            {licence.name || String(licence)}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                            {(provider.insured ||
                                                provider.guarantee_text ||
                                                provider.years_in_business) && (
                                                <ul className="list-disc space-y-1 pl-4">
                                                    {provider.insured && (
                                                        <li>Fully insured</li>
                                                    )}
                                                    {provider.guarantee_text && (
                                                        <li>{provider.guarantee_text}</li>
                                                    )}
                                                    {provider.years_in_business && (
                                                        <li>
                                                            Serving homeowners for{' '}
                                                                {provider.years_in_business}+
                                                            years
                                                        </li>
                                                    )}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {displayTrades.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                                    Services & specialties
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {displayTrades.map((label, i) => (
                                        <Badge
                                            key={i}
                                            variant="secondary"
                                            className="rounded-full text-xs font-medium"
                                        >
                                            {label}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                {/* Business operations & location: open status, hours, map */}
                <section className="space-y-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                        Business operations & location
                    </p>
                    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
                        <div className="space-y-3">
                            {openStatus && (
                                <p className="text-sm font-medium text-foreground">
                                    {openStatus}
                                </p>
                            )}
                            {operatingHoursList.length > 0 ? (
                                <div className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
                                    {operatingHoursList.map(({ day, hours }) => (
                                        <React.Fragment key={day}>
                                            <span className="text-muted-foreground">{day}</span>
                                            <span>{hours}</span>
                                        </React.Fragment>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    Operating hours not available
                                </p>
                            )}
                        </div>
                        {(hasCoords && mapsApiKey) || mapEmbedSrc ? (
                            <div className="overflow-hidden rounded-xl border border-border bg-background">
                                {hasCoords && mapsApiKey ? (
                                    <ProPageMap
                                        apiKey={mapsApiKey}
                                        provider={{
                                            name: provider.name,
                                            address: provider.address ?? undefined,
                                            latitude: provider.latitude as number,
                                            longitude: provider.longitude as number,
                                        }}
                                    />
                                ) : mapEmbedSrc ? (
                                    <div className="h-48 w-full">
                                        <iframe
                                            title="Provider location"
                                            src={mapEmbedSrc}
                                            className="h-full w-full border-0"
                                            loading="lazy"
                                            allowFullScreen
                                            referrerPolicy="no-referrer-when-downgrade"
                                        />
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </section>

                {pastWorkText && (
                    <section className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                            Past work
                        </p>
                        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                            {pastWorkText}
                        </p>
                    </section>
                )}

                <section className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                            Reviews
                        </p>
                        {(ratingText || reviewCountText) && (
                            <div className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                                {ratingText && (
                                    <span className="font-medium text-foreground">
                                        {ratingText}★
                                    </span>
                                )}
                                {reviewCountText && (
                                    <span>
                                        · {reviewCountText}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                            What customers say
                        </p>
                        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                            {customerReviewSummary}
                        </p>
                    </div>
                        {(reviewSnippets.length > 0 || scandioReviews.length > 0) && (
                            <Tabs defaultValue="google" className="w-full">
                                <TabsList className="border-b border-border bg-transparent p-0 h-auto gap-6">
                                    <TabsTrigger
                                        value="google"
                                        className="rounded-none border-b-2 border-transparent pb-2 text-sm text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold bg-transparent px-0 shadow-none"
                                    >
                                        Imported Reviews
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="scandio"
                                        className="rounded-none border-b-2 border-transparent pb-2 text-sm text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold bg-transparent px-0 shadow-none"
                                    >
                                        Scandio Reviews
                                    </TabsTrigger>
                                </TabsList>
                                <TabsContent value="google" className="mt-4">
                                    <div className="grid gap-3 md:grid-cols-2">
                                        {reviewSnippets.slice(0, 8).map((review, i) => (
                                            <div
                                                key={i}
                                                className="rounded-xl border border-border bg-background p-4 text-sm"
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="font-medium">
                                                        {review.author_name || 'Customer'}
                                                    </p>
                                                    {typeof review.rating === 'number' &&
                                                        renderStarRow(review.rating)}
                                                </div>
                                                {review.text && (
                                                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                                                        {review.text}
                                                    </p>
                                                )}
                                                <div className="mt-3 border-t border-border pt-2">
                                                    <div className="flex items-center justify-between gap-2 text-xs">
                                                        <span className="text-muted-foreground">Overall</span>
                                                        {typeof review.rating === 'number'
                                                            ? renderStarRow(review.rating)
                                                            : <span className="text-muted-foreground">—</span>}
                                                    </div>
                                                </div>
                                                {formatReviewDate(review.published_at) && (
                                                    <p className="mt-2 text-[11px] text-muted-foreground">
                                                        {formatReviewDate(review.published_at)} · Imported review
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </TabsContent>
                                <TabsContent value="scandio" className="mt-4">
                                    {scandioReviews.length > 0 ? (
                                        <div className="grid gap-3 md:grid-cols-2">
                                            {scandioReviews.map((review: any, i: number) => (
                                                <div
                                                    key={i}
                                                    className="rounded-xl border border-border bg-background p-4 text-sm"
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="font-medium">
                                                            {review.author_name || 'Customer'}
                                                        </p>
                                                        {typeof review.rating === 'number' &&
                                                            renderStarRow(review.rating)}
                                                    </div>
                                                    {review.text && (
                                                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                                                            {review.text}
                                                        </p>
                                                    )}
                                                    <div className="mt-3 border-t border-border pt-3">
                                                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">
                                                            Category ratings
                                                        </p>
                                                        <div className="space-y-2">
                                                            {(['punctuality', 'professionalism', 'cleanliness', 'quote_accuracy'] as const).map(
                                                                (key) => {
                                                                    const cr = review.category_ratings && typeof review.category_ratings === 'object' ? review.category_ratings as Record<string, unknown> : {};
                                                                    const raw = cr[key];
                                                                    const num = typeof raw === 'number' ? raw : (typeof raw === 'string' ? parseInt(raw, 10) : NaN);
                                                                    const value = Number.isFinite(num) && num >= 1 && num <= 5 ? num : null;
                                                                    const labelMap: Record<string, string> = {
                                                                        punctuality: 'Punctuality',
                                                                        professionalism: 'Professionalism',
                                                                        cleanliness: 'Cleanliness',
                                                                        quote_accuracy: 'Quote accuracy',
                                                                    };
                                                                    return (
                                                                        <div
                                                                            key={key}
                                                                            className="flex items-center justify-between gap-2 text-xs"
                                                                        >
                                                                            <span className="font-medium text-foreground">{labelMap[key]}</span>
                                                                            {value !== null ? renderStarRow(value) : <span className="text-muted-foreground">—</span>}
                                                                        </div>
                                                                    );
                                                                }
                                                            )}
                                                        </div>
                                                    </div>
                                                    {formatReviewDate(review.published_at) && (
                                                        <p className="mt-2 text-[11px] text-muted-foreground">
                                                            {formatReviewDate(review.published_at)} · Scandio review
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-xs text-muted-foreground">
                                            No Scandio verified reviews yet.
                                        </p>
                                    )}
                                </TabsContent>
                            </Tabs>
                        )}

                        {providerId && (
                            <div className="mt-4">
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button size="sm" variant="outline" className="rounded-full">
                                            Add Review
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Leave a Scandio Review</DialogTitle>
                                            <DialogDescription>
                                                Rate this pro on punctuality, professionalism, cleanliness and quote
                                                accuracy, and share a short summary of your experience.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <ProReviewForm providerId={providerId} />
                                    </DialogContent>
                                </Dialog>
                            </div>
                        )}
                    </section>

                {/* Scan CTA: always available in the main content */}
                <section className="rounded-xl border border-border bg-background p-4 md:p-6">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">
                        Get a diagnosis and request this pro
                    </p>
                    <p className="text-sm text-foreground mb-4">
                        Start a free Scandio scan: upload a photo of your issue, get an instant diagnosis and a shareable report, then send it to this pro for a quote.
                    </p>
                    <Button variant="default" size="sm" className="rounded-full" asChild>
                        <Link href="/chat/new">Start a scan</Link>
                    </Button>
                </section>

                <section className="grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                            Gallery
                        </p>
                        {galleryImages.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                                {galleryImages.slice(0, 12).map((photo, i) => (
                                    <figure
                                        key={i}
                                        className="overflow-hidden rounded-xl border border-border bg-background"
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={photo.url}
                                            alt={photo.caption || 'Project photo'}
                                            className="h-full w-full object-cover"
                                        />
                                        {photo.caption && (
                                            <figcaption className="px-2 py-1 text-[11px] text-muted-foreground">
                                                {photo.caption}
                                            </figcaption>
                                        )}
                                    </figure>
                                ))}
                            </div>
                        ) : (
                            <p className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                                No photos in the gallery yet. Photos from Google Places are saved here when the profile is refreshed.
                            </p>
                        )}
                        {providerId && (
                            <div className="mt-3">
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button size="sm" variant="outline" className="rounded-full">
                                            Add photo
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Add a photo to the gallery</DialogTitle>
                                            <DialogDescription>
                                                Upload a photo of the work completed so other homeowners can see past
                                                jobs.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <ProGalleryUpload providerId={providerId} />
                                    </DialogContent>
                                </Dialog>
                            </div>
                        )}
                    </div>
                    {(provider.scandio_blurb || scandioUseCases.length > 0) ? (
                        <div className="space-y-3 rounded-xl border border-border bg-background p-4">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                                How Scandio works with this pro
                            </p>
                            {provider.scandio_blurb && (
                                <p className="text-sm leading-relaxed text-foreground">
                                    {provider.scandio_blurb}
                                </p>
                            )}
                            {scandioUseCases.length > 0 && (
                                <ul className="list-disc space-y-1 pl-4 text-sm text-foreground">
                                    {scandioUseCases.map((useCase, i) => (
                                        <li key={i}>{useCase}</li>
                                    ))}
                                </ul>
                            )}
                            <Button variant="default" size="sm" className="rounded-full" asChild>
                                <Link href="/chat/new">Start a scan and request this pro</Link>
                            </Button>
                        </div>
                    ) : null}
                </section>
            </div>

            <ProStickyFooter
                providerName={provider.name}
                providerPhone={provider.phone}
                website={provider.website}
                directionsHref={directionsHref}
                email={provider.email}
            />
        </main>
    );
}
