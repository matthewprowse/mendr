'use client';

/**
 * Single-scroll contractor profile (post-redesign).
 *
 * Sections (top to bottom):
 *   1. FlowTopBar (back / share)
 *   2. Banner image carousel (or placeholder gradient)
 *   3. Identity card (name, rating, open-until, key person, size/years)
 *   4. Trust strip (certification chips + specialisations)
 *   5. About (summaryLong with read-more) + customer-says blurb
 *   6. Highlights (bullet list)
 *   7. Operating hours card (today + show all)
 *   8. Reviews section (de-tabbed ProReviewsTab)
 *   9. Gallery section (de-tabbed ProGalleryTab)
 *  10. Map card (ProPageMap + directions CTA)
 *  11. Sticky footer (Website + Contact)
 *
 * Data flow:
 *   - useContractor → typed `/api/providers/[id]` (gated copy, certs, gallery thumbs).
 *   - useProReviews / useProGallery → the existing client hooks for review submission
 *     and gallery uploads, both keyed off the resolved provider id.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Heart, Image, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ContactPopover } from '@/components/contact-popover';
import { FlowTopBar } from '@/components/match/flow-shell';
import { HeaderAuth } from '@/components/header-auth';
import { HomeownerAuthDialog } from '@/components/homeowner-auth-dialog';
import { normalizeWebsiteUrl } from '@/lib/utils';
import { trackEvent } from '@/lib/analytics';
import { trackProviderView } from '@/lib/analytics/provider-view';
import { useAuth } from '@/context/auth-context';
import { ProviderCardCarousel } from '@/app/match/components/provider-card';
import { ProReviewsTab } from '@/app/contractors/components/reviews';
import { ProGalleryTab } from '@/app/contractors/components/gallery';
import { ProPageMap } from '@/app/pro/[id]/components/map';
import {
    useContractor,
    type ContractorHydratePayload,
} from '@/app/contractors/hooks/use-contractor';
import { useProReviews } from '@/app/contractors/hooks/use-reviews';
import { useProGallery } from '@/app/contractors/hooks/use-gallery';
import { useSavedProvider } from '@/app/contractors/hooks/use-saved-provider';
import type { CategoryKey } from '@/app/contractors/lib/types';
import type { MatchProviderImage } from '@/features/match/contracts';
import { IdentityCard } from './identity-card';
import { TrustStrip } from './trust-strip';
import { HoursCard } from './hours-card';
import { ReviewsSection } from './reviews-section';
import { GallerySection } from './gallery-section';

const DEFAULT_CATEGORY_RATINGS: Record<CategoryKey, number> = {
    punctuality: 5,
    cleanliness: 5,
    work_quality: 5,
    quote_accuracy: 5,
};

export type ContractorClientProps = {
    initialContractor?: ContractorHydratePayload | null;
    initialServerError?: string | null;
    ssrFetchKey?: string | null;
};

function ContractorClient({
    initialContractor = null,
    initialServerError = null,
    ssrFetchKey = null,
}: ContractorClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const placeIdFromPath = useMemo(() => {
        const m = pathname?.match(/^\/pro\/([^/]+)$/);
        return m ? decodeURIComponent(m[1]) : '';
    }, [pathname]);
    const placeIdParam = searchParams.get('placeId') ?? '';
    const conversationId = searchParams.get('conversationId')?.trim() ?? '';
    const idForFetch = placeIdParam || placeIdFromPath;

    const { profile, isLoading, error } = useContractor(idForFetch, {
        initial: initialContractor,
        initialServerError,
        ssrFetchKey,
    });
    const trackedViewRef = useRef<string>('');
    const trackedSectionsRef = useRef<Set<string>>(new Set());

    const providerId = profile?.providerId ?? null;

    useEffect(() => {
        if (!profile) return;
        const pid = profile.providerId ?? '';
        if (trackedViewRef.current === pid) return;
        trackedViewRef.current = pid;
        trackEvent('contractor_view', {
            provider_id: profile.providerId ?? undefined,
            place_id: profile.googlePlaceId ?? undefined,
            profile_completeness:
                typeof profile.profileCompleteness === 'number' ? profile.profileCompleteness : undefined,
        });
        // Durable profile-view capture (provider-level metric, first per session).
        // Only when we have a DB provider id (FK target). `conversationId` present
        // means the visit came through the diagnosis → match flow.
        if (profile.providerId) {
            trackProviderView(profile.providerId, {
                diagnosisId: conversationId || undefined,
                source: conversationId ? 'match' : 'contractor_page',
            });
        }
    }, [profile, conversationId]);

    const trackSectionExpand = useCallback(
        (section: 'about' | 'reviews' | 'hours' | 'gallery' | 'highlights') => {
            const key = `${providerId ?? ''}:${section}`;
            if (trackedSectionsRef.current.has(key)) return;
            trackedSectionsRef.current.add(key);
            trackEvent('contractor_section_expand', {
                provider_id: providerId ?? undefined,
                section,
            });
        },
        [providerId]
    );

    const { user } = useAuth();
    const isAuthenticated = Boolean(user);

    const saveId = profile?.providerId ?? profile?.googlePlaceId ?? null;
    const { saved, loading: saveLoading, toggle: toggleSave } = useSavedProvider(
        saveId,
        isAuthenticated,
    );
    const [authDialogOpen, setAuthDialogOpen] = useState(false);
    const [authDialogReason, setAuthDialogReason] = useState<string | undefined>(undefined);

    const handleSaveClick = useCallback(async () => {
        if (!isAuthenticated) {
            setAuthDialogReason(`Save ${profile?.name ?? 'this Pro'} to your account so you can find them again easily.`);
            setAuthDialogOpen(true);
            return;
        }
        const next = await toggleSave();
        if (next !== null) {
            trackEvent('contractor_save_toggle', {
                provider_id: providerId ?? undefined,
                saved: next,
            });
        }
    }, [isAuthenticated, toggleSave, profile?.name, providerId]);

    const reviewsState = useProReviews(idForFetch);
    const galleryState = useProGallery({
        resolvedProviderId: reviewsState.resolvedProviderId,
        providerGooglePlaceId: reviewsState.providerGooglePlaceId,
    });

    const [contactOpen, setContactOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [reviewerName, setReviewerName] = useState('');
    const [reviewTitle, setReviewTitle] = useState('');
    const [reviewBody, setReviewBody] = useState('');
    const [categoryRatings, setCategoryRatings] =
        useState<Record<CategoryKey, number>>(DEFAULT_CATEGORY_RATINGS);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [aboutExpanded, setAboutExpanded] = useState(false);

    const handleBack = useCallback(() => {
        if (conversationId) {
            router.push(`/match/${encodeURIComponent(conversationId)}`);
            return;
        }
        router.back();
    }, [conversationId, router]);

    const categoryAverage =
        (categoryRatings.punctuality +
            categoryRatings.cleanliness +
            categoryRatings.work_quality +
            categoryRatings.quote_accuracy) /
        4;

    const websiteHref = useMemo(
        () => normalizeWebsiteUrl(profile?.website ?? null),
        [profile?.website]
    );

    const mapsApiKey =
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
        '';
    const lat = profile?.latitude ?? null;
    const lng = profile?.longitude ?? null;
    const hasMapCoords =
        lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);

    const directionsHref = useMemo(() => {
        if (profile?.address) {
            return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(profile.address)}`;
        }
        if (lat != null && lng != null) {
            return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
        }
        return null;
    }, [profile?.address, lat, lng]);

    const addressDisplayLine =
        profile?.address?.trim() ||
        (lat != null && lng != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : null);

    const galleryImages: MatchProviderImage[] =
        profile?.images && profile.images.length > 0 ? profile.images : [];
    const bannerImages = galleryImages.slice(0, 8);

    const handleShareSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        setSubmitSuccess(false);
        setIsSubmitting(true);
        try {
            const res = await reviewsState.submitReview({
                reviewerName,
                reviewTitle,
                reviewBody,
                categoryRatings,
            });
            if (!res.ok) {
                setSubmitError(res.error);
                return;
            }
            setSubmitSuccess(true);
            setReviewerName('');
            setReviewTitle('');
            setReviewBody('');
            setCategoryRatings(DEFAULT_CATEGORY_RATINGS);
            window.setTimeout(() => {
                setShareOpen(false);
                setSubmitSuccess(false);
            }, 1800);
        } catch {
            setSubmitError('Network error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleContactClick = useCallback(
        (channel: 'phone' | 'whatsapp' | 'email' | 'website') => {
            trackEvent('contractor_contact_click', {
                provider_id: providerId ?? undefined,
                channel,
            });
        },
        [providerId]
    );

    if (error) {
        return (
            <main className="flex min-h-screen flex-col bg-background">
                <FlowTopBar onBack={handleBack} />
                <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
                    <h1 className="text-2xl font-semibold text-foreground">Pro not found</h1>
                    <p className="text-sm text-muted-foreground">
                        We couldn&rsquo;t load this Pro&rsquo;s profile. Please try again.
                    </p>
                    <Button onClick={handleBack} variant="secondary" className="mt-2">
                        Go Back
                    </Button>
                </div>
            </main>
        );
    }

    return (
        <main className="flex min-h-screen flex-col bg-background">
            <HomeownerAuthDialog
                open={authDialogOpen}
                onOpenChange={setAuthDialogOpen}
                reason={authDialogReason}
                returnTo={typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined}
            />
            <FlowTopBar
                onBack={handleBack}
                leftSlot={
                    <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="size-10"
                        onClick={handleBack}
                        aria-label="Go back"
                    >
                        <ArrowLeft size={18} strokeWidth={2.5} aria-hidden />
                    </Button>
                }
                rightSlot={<HeaderAuth />}
            />

            <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
                <BannerCarousel
                    isLoading={isLoading}
                    images={bannerImages}
                    providerName={profile?.name ?? 'Pro'}
                    onSwipe={(idx) =>
                        trackEvent('contractor_image_swipe', {
                            provider_id: providerId ?? undefined,
                            index: idx,
                        })
                    }
                />

                <IdentityCard
                    isLoading={isLoading}
                    name={profile?.name ?? ''}
                    rating={profile?.rating ?? null}
                    ratingCount={profile?.ratingCount ?? 0}
                    isOpen={profile?.isOpen ?? null}
                    nextOpensAt={profile?.nextOpensAt ?? null}
                    yearsInBusiness={profile?.yearsInBusiness ?? null}
                    scandioReviewCount={profile?.scandioReviewCount ?? null}
                />

                {!isLoading && profile ? (
                    <TrustStrip
                        certifications={profile.certifications ?? []}
                        specialisations={profile.specialisations ?? []}
                    />
                ) : null}

                <AboutCard
                    isLoading={isLoading}
                    summary={profile?.summary ?? ''}
                    summaryLong={profile?.summaryLong ?? null}
                    customerSays={profile?.enrichmentReviewSummary ?? null}
                    expanded={aboutExpanded}
                    onToggleExpand={(next) => {
                        setAboutExpanded(next);
                        if (next) trackSectionExpand('about');
                    }}
                />

                {!isLoading && (profile?.highlights ?? []).length > 0 ? (
                    <HighlightsCard highlights={profile?.highlights ?? []} />
                ) : null}

                <HoursCard
                    isLoading={isLoading}
                    weekdayDescriptions={profile?.weekdayDescriptions ?? []}
                    onExpand={() => trackSectionExpand('hours')}
                />

                <ReviewsSection>
                    <ProReviewsTab
                        isOperatingHoursLoading={isLoading}
                        providerSummary={profile?.summary ?? null}
                        isReviewsLoading={reviewsState.isReviewsLoading}
                        scandioReviewsCount={reviewsState.scandioReviewTotalFromScandio}
                        googleReviewsCount={reviewsState.googleReviewTotalFromGoogle}
                        scandioCategoryAggregates={reviewsState.scandioCategoryAggregates}
                        resolvedProviderId={reviewsState.resolvedProviderId}
                        shareOpen={shareOpen}
                        setShareOpen={(open) => {
                            setShareOpen(open);
                            if (open) trackSectionExpand('reviews');
                        }}
                        reviewerName={reviewerName}
                        setReviewerName={setReviewerName}
                        reviewTitle={reviewTitle}
                        setReviewTitle={setReviewTitle}
                        reviewBody={reviewBody}
                        setReviewBody={setReviewBody}
                        categoryRatings={categoryRatings}
                        setCategoryRatings={setCategoryRatings}
                        categoryAverage={categoryAverage}
                        submitError={submitError}
                        submitSuccess={submitSuccess}
                        isSubmitting={isSubmitting}
                        onShareSubmit={handleShareSubmit}
                        scandioReviewsShown={reviewsState.scandioReviewsShown}
                        googleReviewsShown={reviewsState.googleReviewsShown}
                        scandioReviewCardsLength={reviewsState.scandioReviewCards.length}
                        googleReviewCardsLength={reviewsState.googleReviewCards.length}
                        scandioReviewsVisibleCount={reviewsState.scandioReviewsVisibleCount}
                        googleReviewsVisibleCount={reviewsState.googleReviewsVisibleCount}
                        setScandioReviewsVisibleCount={reviewsState.setScandioReviewsVisibleCount}
                        setGoogleReviewsVisibleCount={reviewsState.setGoogleReviewsVisibleCount}
                        providerGooglePlaceId={reviewsState.providerGooglePlaceId}
                    />
                </ReviewsSection>

                <GallerySection>
                    <ProGalleryTab
                        resolvedProviderId={reviewsState.resolvedProviderId}
                        galleryUploading={galleryState.galleryUploading}
                        galleryAddOpen={galleryState.galleryAddOpen}
                        setGalleryAddOpen={(value) => {
                            galleryState.setGalleryAddOpen((prev) => {
                                const next = typeof value === 'function' ? value(prev) : value;
                                if (next) trackSectionExpand('gallery');
                                return next;
                            });
                        }}
                        galleryDraftItems={galleryState.galleryDraftItems}
                        setGalleryDraftItems={galleryState.setGalleryDraftItems}
                        galleryModalError={galleryState.galleryModalError}
                        setGalleryModalError={galleryState.setGalleryModalError}
                        galleryModalSuccess={galleryState.galleryModalSuccess}
                        setGalleryModalSuccess={galleryState.setGalleryModalSuccess}
                        galleryModalInputRef={galleryState.galleryModalInputRef}
                        handleGalleryModalFiles={galleryState.handleGalleryModalFiles}
                        openGalleryAddDialog={galleryState.openGalleryAddDialog}
                        isGalleryLoading={galleryState.isGalleryLoading}
                        isSyncingGoogleGallery={galleryState.isSyncingGoogleGallery}
                        galleryGridImages={galleryState.galleryGridImages}
                        galleryImages={galleryState.galleryImages}
                        setLightbox={galleryState.setLightbox}
                        removeGalleryDraftItem={galleryState.removeGalleryDraftItem}
                        updateGalleryDraftCaption={galleryState.updateGalleryDraftCaption}
                        handleGalleryModalSubmit={galleryState.handleGalleryModalSubmit}
                        lightbox={galleryState.lightbox}
                    />
                </GallerySection>

                <section
                    className="rounded-lg border border-border bg-card p-4"
                    aria-label="Location"
                >
                    <h2 className="mb-3 text-lg font-semibold text-foreground">
                        Location
                    </h2>
                    {isLoading ? (
                        <Skeleton className="h-48 w-full rounded-lg" />
                    ) : hasMapCoords && mapsApiKey && lat != null && lng != null ? (
                        <ProPageMap
                            apiKey={mapsApiKey}
                            provider={{
                                name: profile?.name || 'Pro',
                                address: profile?.address ?? undefined,
                                latitude: lat,
                                longitude: lng,
                            }}
                        />
                    ) : null}
                    {!isLoading && (addressDisplayLine || directionsHref) ? (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            {addressDisplayLine ? (
                                <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                                    {addressDisplayLine}
                                </p>
                            ) : null}
                            {directionsHref ? (
                                <Button variant="secondary" className="h-10 shrink-0" asChild>
                                    <a href={directionsHref} target="_blank" rel="noopener noreferrer">
                                        Get directions
                                    </a>
                                </Button>
                            ) : null}
                        </div>
                    ) : null}
                </section>
            </div>

            <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
                <div className="mx-auto flex w-full max-w-xl flex-row gap-2 px-4">
                    <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="size-10 shrink-0"
                        onClick={() => void handleSaveClick()}
                        disabled={saveLoading}
                        aria-label={saved ? 'Remove from saved' : 'Save Pro'}
                        aria-pressed={saved}
                    >
                        <Heart
                            size={18}
                            fill={saved ? 'currentColor' : 'none'}
                            className={saved ? 'text-rose-500' : undefined}
                            aria-hidden
                        />
                    </Button>
                    {websiteHref ? (
                        <Button variant="ghost" className="flex h-10 flex-1" asChild>
                            <a
                                href={websiteHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => handleContactClick('website')}
                            >
                                Website
                            </a>
                        </Button>
                    ) : (
                        <Button variant="ghost" className="flex h-10 flex-1" disabled type="button">
                            Website
                        </Button>
                    )}
                    <ContactPopover
                        providerName={profile?.name || 'Pro'}
                        displayName={profile?.name || 'Pro'}
                        phone={profile?.phone ?? null}
                        email={null}
                        label="Contact"
                        className="flex h-10 flex-1"
                        open={contactOpen}
                        onOpenChange={setContactOpen}
                        align="end"
                        side="top"
                        onLead={(type) => handleContactClick(type)}
                    />
                </div>
            </div>
        </main>
    );
}

function BannerCarousel({
    isLoading,
    images,
    providerName,
    onSwipe,
}: {
    isLoading: boolean;
    images: MatchProviderImage[];
    providerName: string;
    onSwipe: (idx: number) => void;
}) {
    if (isLoading) {
        return <Skeleton className="h-48 w-full rounded-lg sm:h-56 lg:h-72" />;
    }
    if (images.length === 0) {
        return (
            <div className="flex h-48 w-full items-center justify-center rounded-lg bg-gradient-to-br from-muted to-secondary text-muted-foreground sm:h-56 lg:h-72">
                <div className="flex flex-col items-center gap-1">
                    <Image size={28} aria-hidden />
                    <p className="text-xs font-medium">No photos yet</p>
                    <p className="sr-only">{providerName}</p>
                </div>
            </div>
        );
    }
    return (
        <div className="overflow-hidden rounded-lg">
            <ProviderCardCarousel
                images={images}
                providerName={providerName}
                onImageSwipe={onSwipe}
            />
        </div>
    );
}

function AboutCard({
    isLoading,
    summary,
    summaryLong,
    customerSays,
    expanded,
    onToggleExpand,
}: {
    isLoading: boolean;
    summary: string;
    summaryLong: string | null;
    customerSays: string | null;
    expanded: boolean;
    onToggleExpand: (next: boolean) => void;
}) {
    const longText = (summaryLong ?? '').trim();
    const shortText = summary.trim();
    const rawText = longText || shortText;
    const hasContent = Boolean(rawText);

    // Split on blank lines (model uses \n\n) or single newlines so paragraphs render
    // distinctly rather than running together as one dense block.
    const paragraphs = rawText
        ? rawText.split(/\n+/).map((p) => p.trim()).filter(Boolean)
        : [];

    return (
        <section
            className="rounded-lg border border-border bg-card p-4"
            aria-labelledby="contractor-about-heading"
        >
            <h2 id="contractor-about-heading" className="mb-3 text-lg font-semibold text-foreground">
                About
            </h2>
            {isLoading ? (
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-11/12" />
                    <Skeleton className="h-4 w-3/4" />
                </div>
            ) : !hasContent && !customerSays ? (
                <p className="text-sm text-muted-foreground">
                    A short profile summary will appear here once enrichment completes.
                </p>
            ) : (
                <>
                    {hasContent ? (
                        <>
                            <div className={`flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground ${expanded ? '' : 'line-clamp-6'}`}>
                                {paragraphs.map((para, i) => (
                                    <p key={i}>{para}</p>
                                ))}
                            </div>
                            {rawText.length > 320 ? (
                                <button
                                    type="button"
                                    onClick={() => onToggleExpand(!expanded)}
                                    className="mt-2 text-xs font-medium text-foreground underline-offset-2 hover:underline"
                                >
                                    {expanded ? 'Show Less' : 'Read More'}
                                </button>
                            ) : null}
                        </>
                    ) : null}
                    {customerSays ? (
                        <p className={`flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground ${hasContent ? 'mt-3' : ''}`}>
                            <Star size={14} fill="currentColor" className="mt-0.5 text-yellow-500 shrink-0" aria-hidden />
                            <span>{customerSays}</span>
                        </p>
                    ) : null}
                </>
            )}
        </section>
    );
}

function HighlightsCard({ highlights }: { highlights: string[] }) {
    return (
        <section
            className="rounded-lg border border-border bg-card p-4"
            aria-labelledby="contractor-highlights-heading"
        >
            <h2 id="contractor-highlights-heading" className="mb-3 text-lg font-semibold text-foreground">
                Highlights
            </h2>
            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {highlights.slice(0, 8).map((h, i) => (
                    <li
                        key={i}
                        className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground"
                    >
                        <span className="mt-[6px] size-1.5 shrink-0 rounded-full bg-emerald-500" />
                        <span>{h.trim()}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

export default ContractorClient;
