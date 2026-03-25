 'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ContactPopover } from '@/components/contact-popover';
import { normalizeWebsiteUrl } from '@/lib/utils';
import { compressImage } from '@/lib/image-compression';
import { setImageData } from '@/lib/image-store';
import type { CategoryKey } from './_types/page';
import { useProProvider } from './hooks/providers';
import { useProReviews } from './hooks/reviews';
import { useProGallery } from './hooks/gallery';
import { useStickyHeaderTitle } from './hooks/header';
import { ProAboutTab } from './_components/about-tab';
import { ProReviewsTab } from './_components/reviews-tab';
import { ProGalleryTab } from './_components/gallery-tab';

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

    const headerBarRef = useRef<HTMLDivElement>(null);
    const providerTitleRef = useRef<HTMLDivElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [contactOpen, setContactOpen] = useState(false);

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
        isOperatingHoursLoading,
        operatingHoursByDay,
        showAllOperatingHours,
        setShowAllOperatingHours,
        providerIsOpen,
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
                const conversationId = crypto.randomUUID();
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

    return (
        <main className="flex flex-col gap-6 p-4 pt-22 pb-22">
            <div
                ref={headerBarRef}
                className="flex flex-row justify-between items-center p-4 h-18 bg-background w-full fixed inset-x-0 top-0 z-50"
            >
                <Button variant="secondary" size="icon" className="h-10 w-10" onClick={() => router.back()}>
                    <ArrowLeft className="size-5" />
                </Button>
                <h3 className="text-lg text-foreground font-semibold truncate max-w-[min(280px,55vw)] text-center">
                    {showProviderInHeader ? providerName || 'Company Name' : 'Scandio'}
                </h3>
                <Button variant="ghost" size="icon" className="hover:bg-transparent" />
            </div>

            {isGalleryLoading || isSyncingGoogleGallery ? (
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
                <div ref={providerTitleRef} className="flex flex-row justify-between items-center">
                    <h1 className="text-2xl text-foreground font-bold">{providerName || 'Company Name'}</h1>
                    <Badge variant="secondary">
                        {providerIsOpen === true ? 'Open' : providerIsOpen === false ? 'Closed' : '—'}
                    </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                    {providerSummary?.trim()
                        ? providerSummary.trim()
                        : 'Short customer summary from reviews will appear here when available.'}
                </p>
            </div>

            <Tabs defaultValue="about">
                <TabsList className="grid grid-cols-3 h-10">
                    <TabsTrigger
                        value="about"
                        className="h-8"
                    >
                        About
                    </TabsTrigger>
                    <TabsTrigger
                        value="reviews"
                        className="h-8"
                    >
                        Reviews
                    </TabsTrigger>
                    <TabsTrigger
                        value="gallery"
                        className="h-8"
                    >
                        Gallery
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="about">
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
                    />
                </TabsContent>

                <TabsContent value="reviews">
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
                </TabsContent>

                <TabsContent value="gallery">
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
                </TabsContent>
            </Tabs>

            <div className="flex flex-row gap-2 p-4 bg-background w-full fixed inset-x-0 bottom-0 z-50">
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
        </main>
    );
}

