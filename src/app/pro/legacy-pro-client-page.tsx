'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ContactPopover } from '@/components/contact-popover';
import { createClientId } from '@/lib/client-random-id';
import { normalizeWebsiteUrl } from '@/lib/utils';
import { compressImage } from '@/lib/image-compression';
import { setImageData } from '@/lib/image-store';
import type { CategoryKey } from './types/types';
import { useProProvider } from './hooks/use-provider';
import { useProReviews } from './hooks/use-reviews';
import { useProGallery } from './hooks/use-gallery';
import { useStickyHeaderTitle } from './hooks/use-header';
import { ProAboutTab } from './components/about';
import { ProReviewsTab } from './components/reviews';
import { ProGalleryTab } from './components/gallery';

export default function WelcomePage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const trade = searchParams.get('trade') || '';
    const pathname = usePathname();
    const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    const placeIdFromPath = (() => {
        const m = pathname.match(/^\/pro\/([^/]+)$/);
        return m ? decodeURIComponent(m[1]) : '';
    })();
    const placeId = searchParams.get('placeId') || placeIdFromPath;
    const conversationId = searchParams.get('conversationId')?.trim() || '';

    const headerBarRef = useRef<HTMLDivElement>(null);
    const providerTitleRef = useRef<HTMLDivElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [contactOpen, setContactOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'about' | 'reviews' | 'gallery'>('about');
    const isFirstTabEffect = useRef(true);

    const aboutSectionRef = useRef<HTMLDivElement>(null);
    const reviewsSectionRef = useRef<HTMLDivElement>(null);
    const gallerySectionRef = useRef<HTMLDivElement>(null);
    const tabsStickyRef = useRef<HTMLDivElement>(null);

    const {
        providerName,
        providerAddress,
        providerLat,
        providerLng,
        providerSummary,
        providerSummaryLong,
        providerPhone,
        providerEmail,
        providerWebsiteRaw,
        isProviderLoading,
        isOperatingHoursLoading,
        operatingHoursByDay,
        showAllOperatingHours,
        setShowAllOperatingHours,
        providerIsOpen,
        providerSpecialisations,
        providerHighlights,
        providerRating,
        providerRatingCount,
    } = useProProvider(placeId);

    const {
        isReviewsLoading,
        resolvedProviderId,
        providerGooglePlaceId,
        googleReviewTotalFromGoogle,
        scandioReviewTotalFromScandio,
        googleReviewsShown,
        scandioReviewsShown,
        googleReviewCards,
        scandioReviewCards,
        googleReviewsVisibleCount,
        scandioReviewsVisibleCount,
        setGoogleReviewsVisibleCount,
        setScandioReviewsVisibleCount,
        scandioCategoryAggregates,
        submitReview,
    } = useProReviews(placeId);
    const [shareOpen, setShareOpen] = useState(false);
    const [reviewerName, setReviewerName] = useState('');
    const [reviewTitle, setReviewTitle] = useState('');
    const [reviewBody, setReviewBody] = useState('');
    const [categoryRatings, setCategoryRatings] = useState<Record<CategoryKey, number>>({
        punctuality: 5,
        cleanliness: 5,
        work_quality: 5,
        quote_accuracy: 5,
    });
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const {
        galleryImages,
        isGalleryLoading,
        isSyncingGoogleGallery,
        galleryUploading,
        galleryAddOpen,
        setGalleryAddOpen,
        galleryDraftItems,
        galleryModalError,
        setGalleryModalError,
        galleryModalSuccess,
        setGalleryModalSuccess,
        lightbox,
        setLightbox,
        galleryModalInputRef,
        openGalleryAddDialog,
        removeGalleryDraftItem,
        updateGalleryDraftCaption,
        handleGalleryModalFiles,
        handleGalleryModalSubmit,
        bannerImage,
        galleryGridImages,
        setGalleryDraftItems,
    } = useProGallery({
        resolvedProviderId,
        providerGooglePlaceId,
    });

    const { showProviderInHeader } = useStickyHeaderTitle({
        headerBarRef,
        providerTitleRef,
        providerName,
    });

    const processFile = useCallback(
        async (file: File) => {
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');
            if (!isImage && !isVideo) return;

            setIsUploading(true);
            try {
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                const finalDataUrl = isImage ? await compressImage(dataUrl) : dataUrl;
                const conversationId = createClientId();
                setImageData(conversationId, finalDataUrl, file.name);

                const qp = new URLSearchParams();
                if (trade) qp.set('trade', trade);
                const suffix = qp.toString() ? `?${qp.toString()}` : '';

                router.push(`/diagnosis/${conversationId}${suffix}`);
            } finally {
                setIsUploading(false);
            }
        },
        [router, trade]
    );

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) void processFile(file);
        e.target.value = '';
    };

    const handleBackToMatch = useCallback(() => {
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

    const mapEmbedQuery = useMemo(() => {
        if (providerAddress) return providerAddress;
        if (providerLat != null && providerLng != null) return `${providerLat},${providerLng}`;
        return null;
    }, [providerAddress, providerLat, providerLng]);

    const mapEmbedSrc = useMemo(() => {
        if (!mapEmbedQuery) return null;
        return `https://maps.google.com/maps?q=${encodeURIComponent(mapEmbedQuery)}&z=15&output=embed`;
    }, [mapEmbedQuery]);

    const directionsHref = useMemo(() => {
        if (providerAddress) {
            return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(providerAddress)}`;
        }
        if (providerLat != null && providerLng != null) {
            return `https://www.google.com/maps/dir/?api=1&destination=${providerLat},${providerLng}`;
        }
        return null;
    }, [providerAddress, providerLat, providerLng]);

    const websiteHref = useMemo(() => normalizeWebsiteUrl(providerWebsiteRaw), [providerWebsiteRaw]);

    const addressDisplayLine =
        providerAddress ||
        (providerLat != null && providerLng != null
            ? `${providerLat.toFixed(5)}, ${providerLng.toFixed(5)}`
            : null);

    const mapsApiKey =
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || '';
    const hasMapCoords =
        providerLat != null &&
        providerLng != null &&
        Number.isFinite(providerLat) &&
        Number.isFinite(providerLng);

    const handleShareSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        setSubmitSuccess(false);
        setIsSubmitting(true);
        try {
            const res = await submitReview({
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
            setCategoryRatings({
                punctuality: 5,
                cleanliness: 5,
                work_quality: 5,
                quote_accuracy: 5,
            });
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

    useEffect(() => {
        // Don't jump on first render; only on user tab changes.
        if (isFirstTabEffect.current) {
            isFirstTabEffect.current = false;
            return;
        }

        let cancelled = false;

        const getSectionEl = () =>
            activeTab === 'about'
                ? aboutSectionRef.current
                : activeTab === 'reviews'
                  ? reviewsSectionRef.current
                  : gallerySectionRef.current;

        const tryScroll = (attempt: number) => {
            if (cancelled) return;

            const el = getSectionEl();
            const tabsStickyEl = tabsStickyRef.current;
            if (!el || !tabsStickyEl) {
                if (attempt < 10) window.setTimeout(() => tryScroll(attempt + 1), 0);
                return;
            }

            const elRect = el.getBoundingClientRect();
            const tabsRect = tabsStickyEl.getBoundingClientRect();

            // desired: section wrapper top should sit just below the pinned tabs wrapper
            const desiredElTopInViewport = tabsRect.top + tabsRect.height;
            const currentScrollY = window.scrollY || 0;
            const targetY = currentScrollY + (desiredElTopInViewport - elRect.top);

            // Clamp to document bounds
            const maxY = Math.max(0, document.body.scrollHeight - window.innerHeight);
            const clamped = Math.max(0, Math.min(targetY, maxY));

            window.scrollTo({ top: clamped, behavior: 'smooth' });
        };

        window.setTimeout(() => tryScroll(0), 0);

        return () => {
            cancelled = true;
        };
    }, [activeTab]);

    return (
        <main className="flex min-h-screen flex-col bg-background">
            <div className="fixed inset-x-0 top-0 z-50 bg-background">
                <div
                    ref={headerBarRef}
                    className="mx-auto flex h-18 w-full max-w-xl flex-row items-center justify-between px-4 sm:px-6"
                >
                    <Button variant="secondary" size="icon" className="h-10 w-10" onClick={handleBackToMatch}>
                        <ArrowLeft className="size-5" />
                    </Button>
                    <h3 className="truncate text-center text-lg font-semibold text-foreground max-w-[min(300px,58vw)]">
                        {showProviderInHeader ? (
                            isProviderLoading ? (
                                <Skeleton className="h-5 w-40 mx-auto" />
                            ) : (
                                providerName || 'Provider'
                            )
                        ) : (
                            <span className="inline-flex items-center gap-2">
                                <span>Scandio</span>
                                <Badge variant="secondary">Pro</Badge>
                            </span>
                        )}
                    </h3>
                    {showProviderInHeader ? (
                        isProviderLoading ? (
                            <Skeleton className="h-8 w-20 rounded-full" />
                        ) : (
                            <Badge variant="secondary">
                                {providerIsOpen === true ? 'Open' : providerIsOpen === false ? 'Closed' : '—'}
                            </Badge>
                        )
                    ) : (
                        <Button variant="ghost" size="icon" className="hover:bg-transparent" />
                    )}
                </div>
            </div>

            <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-20 sm:px-6">

            {isProviderLoading || isGalleryLoading || isSyncingGoogleGallery ? (
                <Skeleton className="h-48 w-full rounded-lg" />
            ) : bannerImage ? (
                <div className="relative h-48 w-full overflow-hidden rounded-lg bg-secondary">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={bannerImage.url}
                        alt=""
                        className="h-full w-full object-cover"
                    />
                </div>
            ) : (
                <div className="flex h-48 bg-secondary rounded-lg" />
            )}
            <div className="flex flex-col gap-2">
                <div ref={providerTitleRef} className="flex flex-row justify-between items-start gap-3">
                    <div className="min-w-0 flex flex-col gap-1">
                        <h1 className="truncate text-2xl text-foreground font-bold">
                            {isProviderLoading ? <Skeleton className="h-8 w-56" /> : providerName || 'Provider'}
                        </h1>
                        {isProviderLoading || isOperatingHoursLoading ? (
                            <Skeleton className="h-5 w-28" />
                        ) : providerRating != null ? (
                            <div className="flex items-center gap-1.5">
                                <Star
                                    className="size-3.5 fill-yellow-500 text-yellow-500"
                                    aria-hidden="true"
                                />
                                <span className="text-sm font-semibold text-foreground tabular-nums">
                                    {providerRating.toFixed(1)}
                                </span>
                                {providerRatingCount > 0 && (
                                    <span className="text-sm text-muted-foreground">
                                        · {providerRatingCount.toLocaleString()}{' '}
                                        {providerRatingCount === 1 ? 'review' : 'reviews'}
                                    </span>
                                )}
                            </div>
                        ) : null}
                    </div>
                    {isProviderLoading ? (
                        <Skeleton className="h-8 w-24 rounded-full" />
                    ) : (
                        <Badge variant="secondary">
                            {providerIsOpen === true ? 'Open' : providerIsOpen === false ? 'Closed' : 'Unknown'}
                        </Badge>
                    )}
                </div>
                {isProviderLoading ? (
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-5/6" />
                        <Skeleton className="h-4 w-3/4" />
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {providerSummary?.trim()
                            ? providerSummary.trim()
                            : 'Short customer summary from reviews will appear here when available.'}
                    </p>
                )}
            </div>

            <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as 'about' | 'reviews' | 'gallery')}
                className="w-full"
            >
                <div
                    ref={tabsStickyRef}
                    className="sticky top-[72px] z-40 -mx-4 bg-background px-4 pt-0 pb-4 backdrop-blur sm:-mx-6 sm:px-6"
                >
                    <TabsList className="grid h-10 w-full grid-cols-3 items-stretch">
                        <TabsTrigger
                            value="about"
                            className="h-full min-h-0"
                        >
                            About
                        </TabsTrigger>
                        <TabsTrigger
                            value="reviews"
                            className="h-full min-h-0"
                        >
                            Reviews
                        </TabsTrigger>
                        <TabsTrigger
                            value="gallery"
                            className="h-full min-h-0"
                        >
                            Gallery
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="about">
                    <div ref={aboutSectionRef}>
                        <ProAboutTab
                            operatingHoursByDay={operatingHoursByDay}
                            isOperatingHoursLoading={isOperatingHoursLoading}
                            showAllOperatingHours={showAllOperatingHours}
                            setShowAllOperatingHours={setShowAllOperatingHours}
                            hasMapCoords={hasMapCoords}
                            mapsApiKey={mapsApiKey}
                            providerName={providerName}
                            providerAddress={providerAddress}
                            providerLat={providerLat}
                            providerLng={providerLng}
                            mapEmbedSrc={mapEmbedSrc}
                            addressDisplayLine={addressDisplayLine}
                            directionsHref={directionsHref}
                            profileSummaryLong={providerSummaryLong}
                            specialisations={providerSpecialisations}
                            highlights={providerHighlights}
                        />
                    </div>
                </TabsContent>

                <TabsContent value="reviews">
                    <div ref={reviewsSectionRef}>
                        <ProReviewsTab
                            isOperatingHoursLoading={isOperatingHoursLoading}
                            providerSummary={providerSummary}
                            isReviewsLoading={isReviewsLoading}
                            scandioReviewsCount={scandioReviewTotalFromScandio}
                            googleReviewsCount={googleReviewTotalFromGoogle}
                            scandioCategoryAggregates={scandioCategoryAggregates}
                            resolvedProviderId={resolvedProviderId}
                            shareOpen={shareOpen}
                            setShareOpen={setShareOpen}
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
                            scandioReviewsShown={scandioReviewsShown}
                            googleReviewsShown={googleReviewsShown}
                            scandioReviewCardsLength={scandioReviewCards.length}
                            googleReviewCardsLength={googleReviewCards.length}
                            scandioReviewsVisibleCount={scandioReviewsVisibleCount}
                            googleReviewsVisibleCount={googleReviewsVisibleCount}
                            setScandioReviewsVisibleCount={setScandioReviewsVisibleCount}
                            setGoogleReviewsVisibleCount={setGoogleReviewsVisibleCount}
                            providerGooglePlaceId={providerGooglePlaceId}
                        />
                    </div>
                </TabsContent>

                <TabsContent value="gallery">
                    <div ref={gallerySectionRef}>
                        <ProGalleryTab
                            resolvedProviderId={resolvedProviderId}
                            galleryUploading={galleryUploading}
                            galleryAddOpen={galleryAddOpen}
                            setGalleryAddOpen={setGalleryAddOpen}
                            galleryDraftItems={galleryDraftItems}
                            setGalleryDraftItems={setGalleryDraftItems}
                            galleryModalError={galleryModalError}
                            setGalleryModalError={setGalleryModalError}
                            galleryModalSuccess={galleryModalSuccess}
                            setGalleryModalSuccess={setGalleryModalSuccess}
                            galleryModalInputRef={galleryModalInputRef}
                            handleGalleryModalFiles={handleGalleryModalFiles}
                            openGalleryAddDialog={openGalleryAddDialog}
                            isGalleryLoading={isGalleryLoading}
                            isSyncingGoogleGallery={isSyncingGoogleGallery}
                            galleryGridImages={galleryGridImages}
                            galleryImages={galleryImages}
                            setLightbox={setLightbox}
                            removeGalleryDraftItem={removeGalleryDraftItem}
                            updateGalleryDraftCaption={updateGalleryDraftCaption}
                            handleGalleryModalSubmit={handleGalleryModalSubmit}
                            lightbox={lightbox}
                        />
                    </div>
                </TabsContent>
            </Tabs>

            </div>

            <div className="fixed inset-x-0 bottom-0 z-50 bg-background/95 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
                <div className="mx-auto flex w-full max-w-xl flex-row gap-2 px-4 sm:px-6">
                    {websiteHref ? (
                        <Button variant="ghost" className="flex flex-1 h-10" asChild>
                            <a href={websiteHref} target="_blank" rel="noopener noreferrer">
                                Website
                            </a>
                        </Button>
                    ) : (
                        <Button variant="ghost" className="flex flex-1 h-10" disabled type="button">
                            Website
                        </Button>
                    )}
                    <ContactPopover
                        providerName={providerName || 'Provider'}
                        displayName={providerName || 'Provider'}
                        phone={providerPhone}
                        email={providerEmail}
                        label="Contact"
                        className="flex flex-1 h-10"
                        open={contactOpen}
                        onOpenChange={setContactOpen}
                        align="end"
                        side="top"
                    />
                </div>
            </div>
        </main>
    );
}

