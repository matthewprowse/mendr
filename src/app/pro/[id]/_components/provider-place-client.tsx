'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StarFill } from 'geist-icons';
import { formatBusinessName } from '@/lib/utils';
import type { ReviewCategory } from '@/lib/ai-review-metrics';
import { ProviderLocationMap } from './provider-location-map';
import { WriteReviewDialog } from '@/components/write-review-dialog';
import { ContactPopover } from '@/components/contact-popover';
import { getOpenStatus } from './pro-place-header';
import { supabase } from '@/lib/supabase';

const REVIEW_TRUNCATE_LEN = 280;
const FOUR_CATEGORIES: ReviewCategory[] = ['Punctuality', 'Tidiness', 'Professionalism', 'Quality'];
const DISPLAY_CATEGORIES: { key: ReviewCategory; label: string }[] = [
    { key: 'Punctuality', label: 'Punctuality' },
    { key: 'Tidiness', label: 'Cleanliness' },
    { key: 'Professionalism', label: 'Professionalism' },
    { key: 'Quality', label: 'Quote Accuracy' },
];

export type PlaceProvider = {
    place_id: string;
    name: string;
    address: string | null;
    rating: number | null;
    rating_count: number | null;
    phone: string | null;
    website: string | null;
    summary: string | null;
    services: Array<{ short?: string; full?: string }> | null;
    latitude: number | null;
    longitude: number | null;
    reviews?: Array<{
        text: string;
        rating: number | null;
        relativePublishTimeDescription?: string | null;
        authorName?: string | null;
        media?: Array<{ name: string }> | null;
    }>;
    weekday_descriptions?: string[] | null;
    photos?: Array<{ name: string }> | null;
    reviewsSummary?: string | null;
    reviewCategories?: Partial<Record<ReviewCategory, number[]>> | null;
    aboutCompany?: string | null;
    social?: { instagram?: string; facebook?: string } | null;
};

function getCategoriesForReview(
    reviewIndex: number,
    reviewCategories: Partial<Record<ReviewCategory, number[]>>
): ReviewCategory[] {
    return FOUR_CATEGORIES.filter((cat) => reviewCategories[cat]?.includes(reviewIndex));
}

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
    const normalized = Math.round((rating / max) * 5);
    return (
        <span className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
                <StarFill
                    key={i}
                    className={`h-3.5 w-3.5 ${i < normalized ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground/30'}`}
                />
            ))}
        </span>
    );
}

type SortOption = 'date_desc' | 'date_asc' | 'rating_desc' | 'rating_asc';

function parseDay(line: string): string {
    return line.split(':')[0]?.trim() ?? line;
}

function parseHours(line: string): string {
    const idx = line.indexOf(':');
    if (idx === -1) return line;
    return line.slice(idx + 1).trim();
}

const DAY_SHORT: Record<string, string> = {
    Monday: 'Mon',
    Tuesday: 'Tue',
    Wednesday: 'Wed',
    Thursday: 'Thu',
    Friday: 'Fri',
    Saturday: 'Sat',
    Sunday: 'Sun',
};

function isToday(dayName: string): boolean {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()] === dayName;
}

function isClosedHours(hours: string): boolean {
    return /closed/i.test(hours);
}

function formatHoursDisplay(hours: string): string {
    return hours.replace(/\bAM\b/g, 'am').replace(/\bPM\b/g, 'pm');
}

export function ProviderPlaceClient({
    provider,
    mapsUrl,
}: {
    provider: PlaceProvider;
    mapsUrl: string;
}) {
    const services = provider.services ?? [];
    const reviewCount = provider.rating_count ?? 0;
    const rating = provider.rating != null ? Number(provider.rating).toFixed(1) : null;
    const reviews = provider.reviews ?? [];
    const weekdayDescriptions = provider.weekday_descriptions ?? [];
    const displayName = formatBusinessName(provider.name);
    const reviewsSummary = provider.reviewsSummary ?? null;
    const reviewCategories = provider.reviewCategories ?? {};
    const aboutCompany = provider.aboutCompany ?? null;
    const social = provider.social ?? {};
    const photos = provider.photos ?? [];

    const [expandedReviewIndex, setExpandedReviewIndex] = useState<number | null>(null);
    const [filterCategory, setFilterCategory] = useState<ReviewCategory | 'All'>('All');
    const [sortOption, setSortOption] = useState<SortOption>('date_desc');
    const [writeReviewOpen, setWriteReviewOpen] = useState(false);
    const [galleryUploadOpen, setGalleryUploadOpen] = useState(false);
    const [scandioReviews, setScandioReviews] = useState<Array<{
        id: string;
        reviewer_name: string;
        rating: number;
        title: string | null;
        body: string;
        image_urls: string[];
        created_at: string;
    }>>([]);

    // Fetch approved Scandio reviews for this provider
    useEffect(() => {
        const placeId = provider.place_id;
        if (!placeId) return;
        fetch(`/api/reviews?place_id=${encodeURIComponent(placeId)}`)
            .then((r) => r.json())
            .then((data) => { if (data.reviews) setScandioReviews(data.reviews); })
            .catch(() => {});
    }, [provider.place_id]);

    const categorySummary = useMemo(() => {
        const out: Array<{ key: ReviewCategory; label: string; avgRating: number; weight: number }> = [];
        for (const { key, label } of DISPLAY_CATEGORIES) {
            const indices = reviewCategories[key];
            if (!indices?.length) continue;
            let sum = 0;
            let count = 0;
            for (const i of indices) {
                const r = reviews[i];
                if (r?.rating != null) {
                    sum += Number(r.rating);
                    count++;
                }
            }
            if (count) out.push({ key, label, avgRating: sum / count, weight: indices.length });
        }
        return out;
    }, [reviewCategories, reviews]);

    const filteredAndSortedReviews = useMemo(() => {
        let result = reviews.map((r, i) => ({ review: r, index: i }));

        if (filterCategory !== 'All') {
            const indices = reviewCategories[filterCategory] ?? [];
            result = result.filter(({ index }) => indices.includes(index));
        }

        result.sort((a, b) => {
            if (sortOption === 'rating_desc') return (b.review.rating ?? 0) - (a.review.rating ?? 0);
            if (sortOption === 'rating_asc') return (a.review.rating ?? 0) - (b.review.rating ?? 0);
            return 0;
        });

        return result;
    }, [reviews, reviewCategories, filterCategory, sortOption]);

    const hasCoords = provider.latitude != null && provider.longitude != null;
    const directionsUrl =
        hasCoords
            ? `https://www.google.com/maps/dir/?api=1&destination=${provider.latitude},${provider.longitude}&destination_place_id=${(provider.place_id || '').replace(/^places\//, '')}`
            : mapsUrl;

    const mapsApiKey =
        typeof process !== 'undefined'
            ? process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ||
              process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
              ''
            : '';

    const openStatus = getOpenStatus(weekdayDescriptions);

    return (
        <>
        {/* ── Page content, padded at bottom so sticky footer doesn't overlap ── */}
        <div className="space-y-6 pb-24">
            {/* ── Banner ── */}
            <div className="relative h-56 w-full overflow-hidden rounded-md bg-gradient-to-br from-muted via-muted/80 to-muted sm:h-72">

                {/* Open/closed badge — top right */}
                {openStatus && (
                    <div className="absolute right-3 top-3 z-10">
                        <div className="rounded-md border border-border bg-background px-3 py-2">
                            <p className="text-sm font-semibold text-foreground">
                                {openStatus.open ? 'Open' : 'Closed'}
                            </p>
                            {openStatus.label.includes('·') && (
                                <p className="mt-0.5 text-xs text-muted-foreground leading-tight">
                                    {openStatus.label.split('·').slice(1).join('·').trim()}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Name + rating — bottom left */}
                <div className="absolute bottom-3 left-3 right-3">
                    <div className="flex items-end gap-3">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted shadow-sm sm:h-16 sm:w-16">
                            <span className="text-lg font-semibold text-muted-foreground sm:text-xl">
                                {displayName
                                    .split(/\s+/)
                                    .filter((w) => w !== '&')
                                    .map((w) => w[0])
                                    .join('')
                                    .slice(0, 2)
                                    .toUpperCase()}
                            </span>
                        </div>
                        <div className="min-w-0 flex-1">
                            <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                                {displayName}
                            </h1>
                            {(rating || reviewCount > 0) && (
                                <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                                    {rating != null && (
                                        <span className="flex items-center gap-1.5 font-medium">
                                            <StarFill className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                            <span className="text-foreground">{rating}</span>
                                        </span>
                                    )}
                                    {reviewCount > 0 && (
                                        <span>({reviewCount} review{reviewCount === 1 ? '' : 's'})</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Overview (above tabs) ── */}
            {(provider.summary || aboutCompany || services.length > 0) && (
                <div className="space-y-4">
                    {provider.summary && (
                        <p className="text-sm leading-relaxed text-foreground">
                            {provider.summary}
                        </p>
                    )}
                    {!provider.summary && !reviewsSummary && (
                        <p className="text-sm text-muted-foreground">
                            No summary available yet. This provider appears in search results; more
                            details will appear after we analyse their listing and reviews.
                        </p>
                    )}
                    {aboutCompany && (
                        <p className="text-sm leading-relaxed text-foreground">
                            {aboutCompany}
                        </p>
                    )}
                    {services.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {services.map((s, i) => (
                                <Badge key={i} variant="secondary" className="text-sm">
                                    {typeof s === 'string'
                                        ? s
                                        : (s?.full ?? s?.short ?? 'Service')}
                                </Badge>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <Tabs defaultValue="summary" className="w-full">
                <TabsList className="w-full rounded-lg bg-muted p-1">
                    <TabsTrigger value="summary" className="flex-1">Summary</TabsTrigger>
                    <TabsTrigger value="reviews" className="flex-1">Reviews</TabsTrigger>
                    <TabsTrigger value="gallery" className="flex-1">Gallery</TabsTrigger>
                </TabsList>

                {/* ── SUMMARY TAB ── */}
                <TabsContent value="summary" className="mt-6 space-y-6">

                    {/* Operating Hours */}
                    {weekdayDescriptions.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Operating Hours
                            </p>
                            <ul className="space-y-1">
                                {weekdayDescriptions.map((line, i) => {
                                    const dayName = parseDay(line);
                                    const hours = formatHoursDisplay(parseHours(line));
                                    const today = isToday(dayName);
                                    const closed = isClosedHours(hours);
                                    return (
                                        <li key={i} className="flex items-baseline justify-between gap-4 text-sm">
                                            <span className={`flex items-center gap-1.5 font-medium ${today ? 'text-foreground' : 'text-muted-foreground'}`}>
                                                {today && (
                                                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                                                )}
                                                {DAY_SHORT[dayName] ?? dayName}
                                            </span>
                                            <span className={`text-right ${closed ? 'text-muted-foreground/50' : today ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                                                {hours}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}

                    {/* Location */}
                    {(provider.address || hasCoords) && (
                        <div className="space-y-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Location</p>
                            {hasCoords && mapsApiKey && (
                                <ProviderLocationMap
                                    apiKey={mapsApiKey}
                                    providerLat={provider.latitude!}
                                    providerLng={provider.longitude!}
                                    providerName={displayName}
                                    directionsUrl={directionsUrl}
                                    providerAddress={provider.address}
                                    providerPlaceId={provider.place_id}
                                />
                            )}
                        </div>
                    )}

                    {/* Social */}
                    {(social?.instagram || social?.facebook) && (
                        <div className="space-y-2">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Social
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {social.instagram && (
                                    <Button asChild size="sm" variant="outline">
                                        <a
                                            href={social.instagram.startsWith('http') ? social.instagram : `https://instagram.com/${social.instagram.replace(/^@/, '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            Instagram
                                        </a>
                                    </Button>
                                )}
                                {social.facebook && (
                                    <Button asChild size="sm" variant="outline">
                                        <a
                                            href={social.facebook.startsWith('http') ? social.facebook : `https://facebook.com/${social.facebook}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            Facebook
                                        </a>
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </TabsContent>

                {/* ── REVIEWS TAB ── */}
                <TabsContent value="reviews" className="mt-6 space-y-6">
                    <div className="space-y-6">

                        {/* ── Write a review CTA ── */}
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-base font-semibold leading-none">Reviews</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Customer reviews from Google and Scandio users.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="shrink-0"
                                onClick={() => setWriteReviewOpen(true)}
                            >
                                Write a review
                            </Button>
                        </div>

                        {/* AI review summary — shown at top of the reviews tab */}
                        {reviewsSummary && (
                            <blockquote className="border-l-2 border-border pl-3">
                                <p className="text-sm leading-relaxed text-muted-foreground italic">
                                    {reviewsSummary}
                                </p>
                            </blockquote>
                        )}

                        <WriteReviewDialog
                            open={writeReviewOpen}
                            onOpenChange={setWriteReviewOpen}
                            providerName={displayName}
                            placeId={provider.place_id}
                        />

                        {/* ── Scandio reviews ── */}
                        {scandioReviews.length > 0 && (
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-foreground">
                                    Scandio reviews ({scandioReviews.length})
                                </h3>
                                <ul className="space-y-5">
                                    {scandioReviews.map((r) => {
                                        const initial = r.reviewer_name
                                            .split(/\s+/)
                                            .map((w) => w[0])
                                            .join('')
                                            .slice(0, 2)
                                            .toUpperCase() || '?';
                                        const reviewImages = (r.image_urls ?? []).filter(Boolean);
                                        return (
                                            <li key={r.id} className="border-b border-border pb-5 last:border-0 last:pb-0">
                                                <div className="flex items-start gap-3">
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                                                        {initial}
                                                    </div>
                                                    <div className="min-w-0 flex-1 space-y-2">
                                                        <div className="flex flex-wrap items-center justify-between gap-1">
                                                            <span className="text-xs font-semibold text-foreground">
                                                                {r.reviewer_name}
                                                            </span>
                                                            <span className="shrink-0 text-xs text-muted-foreground">
                                                                {new Date(r.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <StarRating rating={r.rating} max={5} />
                                                            <span className="text-xs text-muted-foreground">
                                                                {r.rating.toFixed(1)}
                                                            </span>
                                                        </div>
                                                        {r.title && (
                                                            <p className="text-sm font-medium text-foreground">{r.title}</p>
                                                        )}
                                                        <blockquote className="border-l-2 border-border pl-3">
                                                            <p className="text-sm leading-relaxed text-muted-foreground italic">
                                                                {r.body}
                                                            </p>
                                                        </blockquote>
                                                        {reviewImages.length > 0 && (
                                                            <div className="flex flex-wrap gap-2">
                                                                {reviewImages.map((url, idx) => (
                                                                    <a
                                                                        key={idx}
                                                                        href={url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="relative h-20 w-20 overflow-hidden rounded-md bg-muted"
                                                                    >
                                                                        <Image
                                                                            src={url}
                                                                            alt=""
                                                                            fill
                                                                            className="object-cover"
                                                                            sizes="80px"
                                                                            unoptimized
                                                                        />
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}

                        {/* ── Google reviews ── */}
                        {reviews.length > 0 && (
                            <h3 className="text-sm font-semibold text-foreground">
                                Google reviews ({reviews.length})
                            </h3>
                        )}
                        {reviews.length > 0 ? (
                            <>
                                {/* Category grid — 2 per row on desktop, 1 on mobile */}
                                {categorySummary.length > 0 && (
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        {categorySummary.map(({ key, label, avgRating, weight }) => (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() =>
                                                    setFilterCategory(
                                                        filterCategory === key ? 'All' : key
                                                    )
                                                }
                                                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                                                    filterCategory === key
                                                        ? 'border-foreground bg-muted'
                                                        : 'border-border bg-muted/20 hover:bg-muted/40'
                                                }`}
                                            >
                                                <div className="space-y-1">
                                                    <p className="text-sm font-semibold text-foreground">
                                                        {label}
                                                    </p>
                                                    <StarRating rating={avgRating} max={5} />
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-lg font-bold text-foreground">
                                                        {avgRating.toFixed(1)}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {weight} review{weight === 1 ? '' : 's'}
                                                    </p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Filter + Sort row */}
                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="flex flex-wrap gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setFilterCategory('All')}
                                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                                filterCategory === 'All'
                                                    ? 'border-foreground bg-foreground text-background'
                                                    : 'border-border text-muted-foreground hover:border-foreground/40'
                                            }`}
                                        >
                                            All
                                        </button>
                                        {DISPLAY_CATEGORIES.map(({ key, label }) => (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() =>
                                                    setFilterCategory(
                                                        filterCategory === key ? 'All' : key
                                                    )
                                                }
                                                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                                    filterCategory === key
                                                        ? 'border-foreground bg-foreground text-background'
                                                        : 'border-border text-muted-foreground hover:border-foreground/40'
                                                }`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="ml-auto">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                                                    Sort
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        viewBox="0 0 16 16"
                                                        fill="currentColor"
                                                        className="h-3 w-3"
                                                    >
                                                        <path
                                                            fillRule="evenodd"
                                                            d="M5.22 10.22a.75.75 0 0 1 1.06 0L8 11.94l1.72-1.72a.75.75 0 1 1 1.06 1.06l-2.25 2.25a.75.75 0 0 1-1.06 0l-2.25-2.25a.75.75 0 0 1 0-1.06ZM10.78 5.78a.75.75 0 0 1-1.06 0L8 4.06 6.28 5.78a.75.75 0 0 1-1.06-1.06l2.25-2.25a.75.75 0 0 1 1.06 0l2.25 2.25a.75.75 0 0 1 0 1.06Z"
                                                            clipRule="evenodd"
                                                        />
                                                    </svg>
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48">
                                                <DropdownMenuRadioGroup
                                                    value={sortOption}
                                                    onValueChange={(v) =>
                                                        setSortOption(v as SortOption)
                                                    }
                                                >
                                                    <DropdownMenuRadioItem value="date_desc">
                                                        Newest first
                                                    </DropdownMenuRadioItem>
                                                    <DropdownMenuRadioItem value="date_asc">
                                                        Oldest first
                                                    </DropdownMenuRadioItem>
                                                    <DropdownMenuRadioItem value="rating_desc">
                                                        Highest rating
                                                    </DropdownMenuRadioItem>
                                                    <DropdownMenuRadioItem value="rating_asc">
                                                        Lowest rating
                                                    </DropdownMenuRadioItem>
                                                </DropdownMenuRadioGroup>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>

                                {/* Review list */}
                                {filteredAndSortedReviews.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        No reviews in this category.
                                    </p>
                                ) : (
                                    <ul className="space-y-5">
                                        {filteredAndSortedReviews.map(({ review: r, index: i }) => {
                                            const cats = getCategoriesForReview(i, reviewCategories);
                                            const isExpanded = expandedReviewIndex === i;
                                            const text = r.text ?? '';
                                            const truncated =
                                                text.length > REVIEW_TRUNCATE_LEN && !isExpanded;
                                            const displayText = truncated
                                                ? text.slice(0, REVIEW_TRUNCATE_LEN) + '…'
                                                : text;

                                            // Format author name as "FirstName S."
                                            // If no name → generate "Google User"
                                            // If only one word → generate a surname initial
                                            const rawAuthor = (r.authorName ?? '').trim();
                                            const FALLBACK_FIRST = 'Google';
                                            const FALLBACK_LAST = 'User';
                                            const toTitleCaseWord = (w: string) =>
                                                w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
                                            let formattedAuthor: string;
                                            if (!rawAuthor || rawAuthor.toLowerCase() === 'google user') {
                                                formattedAuthor = `${FALLBACK_FIRST} ${FALLBACK_LAST.charAt(0)}.`;
                                            } else {
                                                const parts = rawAuthor.split(/\s+/).filter(Boolean);
                                                const first = toTitleCaseWord(parts[0]);
                                                if (parts.length >= 2) {
                                                    formattedAuthor = `${first} ${parts[1].charAt(0).toUpperCase()}.`;
                                                } else {
                                                    // Only one name — use it as first name, generate a surname initial
                                                    // Derive a deterministic placeholder initial from the name length
                                                    const placeholderInitial = String.fromCharCode(
                                                        65 + (first.charCodeAt(0) % 26)
                                                    );
                                                    formattedAuthor = `${first} ${placeholderInitial}.`;
                                                }
                                            }

                                            const initial = formattedAuthor
                                                .replace('.', '')
                                                .split(/\s+/)
                                                .map((w) => w[0])
                                                .join('')
                                                .slice(0, 2)
                                                .toUpperCase() || '?';
                                            const reviewMedia = r.media?.filter((m) => m?.name) ?? [];
                                            return (
                                                <li
                                                    key={i}
                                                    className="border-b border-border pb-5 last:border-0 last:pb-0"
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                                                            {initial}
                                                        </div>
                                                        <div className="min-w-0 flex-1 space-y-2">
                                                            {/* Author + date row */}
                                                            <div className="flex flex-wrap items-center justify-between gap-1">
                                                                <span className="text-xs font-semibold text-foreground">
                                                                    {formattedAuthor}
                                                                </span>
                                                                {r.relativePublishTimeDescription && (
                                                                    <span className="shrink-0 text-xs text-muted-foreground">
                                                                        {r.relativePublishTimeDescription}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Star rating */}
                                                            {r.rating != null && (
                                                                <div className="flex items-center gap-2">
                                                                    <StarRating
                                                                        rating={Number(r.rating)}
                                                                        max={5}
                                                                    />
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {Number(r.rating).toFixed(1)}
                                                                    </span>
                                                                </div>
                                                            )}

                                                            {/* All 4 category rows — rating when assigned, dash when not */}
                                                            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                                                                {DISPLAY_CATEGORIES.map(({ key, label }) => {
                                                                    const assigned = cats.includes(key);
                                                                    const catRating = assigned && r.rating != null
                                                                        ? Number(r.rating).toFixed(1)
                                                                        : null;
                                                                    return (
                                                                        <div key={key} className="flex items-center justify-between gap-1">
                                                                            <span className="text-xs text-muted-foreground">
                                                                                {label}
                                                                            </span>
                                                                            <span className={`text-xs font-medium ${catRating ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                                                                                {catRating ?? '—'}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>

                                                            {/* Review text as blockquote */}
                                                            <blockquote className="border-l-2 border-border pl-3">
                                                                <p className="text-sm leading-relaxed text-muted-foreground italic">
                                                                    {displayText}
                                                                </p>
                                                                {truncated && (
                                                                    <button
                                                                        type="button"
                                                                        className="mt-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline hover:text-foreground transition-colors"
                                                                        onClick={() => setExpandedReviewIndex(i)}
                                                                    >
                                                                        Read more
                                                                    </button>
                                                                )}
                                                            </blockquote>

                                                            {/* Review media */}
                                                            {reviewMedia.length > 0 && (
                                                                <div className="flex flex-wrap gap-2">
                                                                    {reviewMedia.map((m, idx) => {
                                                                        const photoUrl = `/api/place-photo?name=${encodeURIComponent(m.name)}&maxWidthPx=320`;
                                                                        return (
                                                                            <a
                                                                                key={m.name || idx}
                                                                                href={photoUrl}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="relative h-20 w-20 overflow-hidden rounded-md bg-muted"
                                                                            >
                                                                                <Image
                                                                                    src={photoUrl}
                                                                                    alt=""
                                                                                    fill
                                                                                    className="object-cover"
                                                                                    sizes="80px"
                                                                                    unoptimized
                                                                                />
                                                                            </a>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                No reviews have been stored yet. View on Google Maps for the full
                                list of reviews.
                            </p>
                        )}
                        <Button asChild variant="outline" size="sm">
                            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                                View all reviews on Google Maps
                            </a>
                        </Button>
                    </div>
                </TabsContent>

                {/* ── GALLERY TAB ── */}
                <TabsContent value="gallery" className="mt-6 space-y-6">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-base font-semibold leading-none">Gallery</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Photos from this business.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="shrink-0"
                                onClick={() => setGalleryUploadOpen(true)}
                            >
                                Upload photos
                            </Button>
                        </div>
                        {photos.length > 0 ? (
                            <MasonryGallery photos={photos} />
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                No photos yet.
                            </p>
                        )}
                        <Button asChild variant="outline" size="sm">
                            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                                View on Google Maps
                            </a>
                        </Button>
                    </div>
                </TabsContent>
            </Tabs>
        </div>

        {/* ── Gallery upload dialog ── */}
        <UploadGalleryDialog
            open={galleryUploadOpen}
            onOpenChange={setGalleryUploadOpen}
            providerName={displayName}
            placeId={provider.place_id}
        />

        {/* ── Sticky footer: Contact (primary) · Website (secondary) · Get Directions (ghost) ── */}
        {(provider.website || provider.phone || hasCoords) && (
            <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm">
                <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
                    {/* Contact — primary, far left */}
                    {provider.phone && (
                        <ContactPopover
                            providerName={provider.name}
                            displayName={displayName}
                            phone={provider.phone}
                            side="top"
                            align="start"
                            label="Contact"
                            className="flex-1"
                        />
                    )}
                    {/* Website — secondary, middle */}
                    {provider.website && (
                        <Button asChild variant="secondary" className="flex-1">
                            <a href={provider.website} target="_blank" rel="noopener noreferrer">
                                Website
                            </a>
                        </Button>
                    )}
                    {/* Get Directions — ghost, far right */}
                    <Button asChild variant="ghost" className="flex-1">
                        <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                            Get Directions
                        </a>
                    </Button>
                </div>
            </div>
        )}
        </>
    );
}

// ---------------------------------------------------------------------------
// Gallery upload dialog
// ---------------------------------------------------------------------------
const MAX_GALLERY_IMAGES = 8;
const MAX_GALLERY_MB = 10;

function UploadGalleryDialog({
    open,
    onOpenChange,
    providerName,
    placeId,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    providerName: string;
    placeId?: string | null;
}) {
    const [uploaderName, setUploaderName] = useState('');
    const [imageTitle, setImageTitle] = useState('');
    const [imageDesc, setImageDesc] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [step, setStep] = useState<'form' | 'uploading' | 'success' | 'error'>('form');
    const [errMsg, setErrMsg] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const reset = () => {
        setUploaderName('');
        setImageTitle('');
        setImageDesc('');
        setFiles([]);
        setPreviews([]);
        setStep('form');
        setErrMsg(null);
    };

    const handleClose = (v: boolean) => {
        if (!v) reset();
        onOpenChange(v);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const picked = Array.from(e.target.files ?? []).filter(
            (f) => f.size <= MAX_GALLERY_MB * 1024 * 1024
        );
        const combined = [...files, ...picked].slice(0, MAX_GALLERY_IMAGES);
        setFiles(combined);
        setPreviews(combined.map((f) => URL.createObjectURL(f)));
        if (fileRef.current) fileRef.current.value = '';
    };

    const removeFile = (idx: number) => {
        const next = files.filter((_, i) => i !== idx);
        setFiles(next);
        setPreviews(next.map((f) => URL.createObjectURL(f)));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (files.length === 0) return;
        setStep('uploading');
        setErrMsg(null);
        try {
            const folder = placeId
                ? `gallery/place/${placeId.replace(/[^a-zA-Z0-9-_]/g, '_')}`
                : 'gallery/misc';

            const uploadedMeta: Array<{ url: string; title: string; description: string; uploader: string }> = [];

            for (const file of files) {
                const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
                const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
                const { error: upErr } = await supabase.storage
                    .from('gallery')
                    .upload(path, file, { contentType: file.type, upsert: false });
                if (upErr) throw upErr;
                const { data: { publicUrl } } = supabase.storage.from('gallery').getPublicUrl(path);
                uploadedMeta.push({
                    url: publicUrl,
                    title: imageTitle.trim(),
                    description: imageDesc.trim(),
                    uploader: uploaderName.trim(),
                });
            }

            // Persist to gallery_uploads table (best-effort; table may not exist yet)
            await fetch('/api/gallery', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    place_id: placeId ?? null,
                    uploads: uploadedMeta,
                }),
            });

            setStep('success');
        } catch (err) {
            setErrMsg(err instanceof Error ? err.message : 'Upload failed. Please try again.');
            setStep('error');
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
                {step === 'success' ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>Photos uploaded</DialogTitle>
                            <DialogDescription>
                                Thank you for contributing photos of{' '}
                                <span className="font-medium text-foreground">{providerName}</span>.
                                They will appear in the gallery once reviewed.
                            </DialogDescription>
                        </DialogHeader>
                        <Button className="w-full" onClick={() => handleClose(false)}>
                            Done
                        </Button>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>Upload photos</DialogTitle>
                            <DialogDescription>
                                Share up to {MAX_GALLERY_IMAGES} photos of{' '}
                                <span className="font-medium text-foreground">{providerName}</span>.
                            </DialogDescription>
                        </DialogHeader>

                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            {/* Name */}
                            <div className="space-y-1.5">
                                <Label htmlFor="gal-name">Your name <span className="text-destructive">*</span></Label>
                                <Input
                                    id="gal-name"
                                    placeholder="e.g. James T."
                                    value={uploaderName}
                                    onChange={(e) => setUploaderName(e.target.value)}
                                    required
                                    disabled={step === 'uploading'}
                                />
                            </div>

                            {/* Title */}
                            <div className="space-y-1.5">
                                <Label htmlFor="gal-title">Photo title</Label>
                                <Input
                                    id="gal-title"
                                    placeholder="e.g. Kitchen renovation"
                                    value={imageTitle}
                                    onChange={(e) => setImageTitle(e.target.value)}
                                    maxLength={100}
                                    disabled={step === 'uploading'}
                                />
                            </div>

                            {/* Description */}
                            <div className="space-y-1.5">
                                <Label htmlFor="gal-desc">Description</Label>
                                <Textarea
                                    id="gal-desc"
                                    placeholder="Describe what's shown in the photo(s)…"
                                    rows={3}
                                    value={imageDesc}
                                    onChange={(e) => setImageDesc(e.target.value)}
                                    disabled={step === 'uploading'}
                                />
                            </div>

                            {/* Image picker */}
                            <div className="space-y-1.5">
                                <Label>
                                    Photos <span className="text-destructive">*</span>{' '}
                                    <span className="font-normal text-muted-foreground">(up to {MAX_GALLERY_IMAGES})</span>
                                </Label>
                                {previews.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {previews.map((src, idx) => (
                                            <div
                                                key={idx}
                                                className="relative h-20 w-20 overflow-hidden rounded-md border border-border bg-muted"
                                            >
                                                <a
                                                    href={src}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="block h-full w-full"
                                                    tabIndex={-1}
                                                >
                                                    <Image
                                                        src={src}
                                                        alt={`Preview ${idx + 1}`}
                                                        fill
                                                        className="object-cover"
                                                        sizes="80px"
                                                        unoptimized
                                                    />
                                                </a>
                                                <button
                                                    type="button"
                                                    onClick={() => removeFile(idx)}
                                                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-foreground hover:bg-background"
                                                    aria-label="Remove"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                                                        <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {files.length < MAX_GALLERY_IMAGES && (
                                    <>
                                        <input
                                            ref={fileRef}
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="sr-only"
                                            onChange={handleFileSelect}
                                            disabled={step === 'uploading'}
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => fileRef.current?.click()}
                                            disabled={step === 'uploading'}
                                        >
                                            Add photos
                                        </Button>
                                    </>
                                )}
                                <p className="text-xs text-muted-foreground">Max {MAX_GALLERY_MB} MB per photo.</p>
                            </div>

                            {step === 'error' && errMsg && (
                                <p className="text-sm text-destructive">{errMsg}</p>
                            )}

                            <div className="flex gap-2 pt-1">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => handleClose(false)}
                                    disabled={step === 'uploading'}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    className="flex-1"
                                    disabled={step === 'uploading' || files.length === 0 || !uploaderName.trim()}
                                >
                                    {step === 'uploading' ? 'Uploading…' : 'Upload'}
                                </Button>
                            </div>
                        </form>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

/**
 * Two-column CSS-columns masonry gallery.
 * Images flow naturally into two columns — no fixed aspect ratios, no gaps.
 */
function MasonryGallery({ photos }: { photos: Array<{ name: string }> }) {
    const [lightbox, setLightbox] = useState<string | null>(null);

    const items = photos.map((photo, idx) => ({
        name: photo.name,
        url: `/api/place-photo?name=${encodeURIComponent(photo.name)}&maxWidthPx=800`,
        thumb: `/api/place-photo?name=${encodeURIComponent(photo.name)}&maxWidthPx=400`,
        idx,
    }));

    return (
        <>
            {/* CSS columns — images fill their natural height, no gaps possible */}
            <div className="columns-2 gap-2 sm:gap-3">
                {items.map((item) => (
                    <button
                        key={item.name || item.idx}
                        type="button"
                        onClick={() => setLightbox(item.url)}
                        className="group relative mb-2 sm:mb-3 w-full overflow-hidden rounded-lg bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring break-inside-avoid block"
                    >
                        <Image
                            src={item.thumb}
                            alt=""
                            width={400}
                            height={400}
                            className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-105"
                            sizes="(max-width: 640px) 50vw, 40vw"
                            unoptimized
                        />
                        <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                    </button>
                ))}
            </div>

            {/* Lightbox */}
            {lightbox && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                    onClick={() => setLightbox(null)}
                >
                    <button
                        type="button"
                        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
                        onClick={() => setLightbox(null)}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5">
                            <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                        </svg>
                    </button>
                    <div
                        className="relative max-h-[90vh] max-w-3xl w-full"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Image
                            src={lightbox}
                            alt=""
                            width={800}
                            height={1200}
                            className="mx-auto max-h-[85vh] w-auto rounded-xl object-contain"
                            style={{ height: 'auto' }}
                            unoptimized
                        />
                    </div>
                </div>
            )}
        </>
    );
}
