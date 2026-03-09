'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { ReviewCategory } from '@/lib/ai-review-metrics';
import { WriteReviewDialog } from '@/components/write-review-dialog';
import { Eye, StarFill } from '@/lib/icons';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
    Popover,
    PopoverTrigger,
    PopoverContent,
    PopoverHeader,
    PopoverTitle,
    PopoverDescription,
} from '@/components/ui/popover';

type CustomerReview = {
    id: string;
    reviewer_name?: string | null;
    rating: number | null;
    category_ratings?: {
        punctuality?: number | null;
        professionalism?: number | null;
        tidiness?: number | null;
        quote_accuracy?: number | null;
    } | null;
    title?: string | null;
    body: string;
    created_at: string;
};

type GoogleReview = {
    text: string;
    rating: number | null;
    relativePublishTimeDescription?: string | null;
    authorName?: string | null;
    /** Absolute publish date derived from Google relative description, stored from backend when available */
    published_at?: string | null;
};

type ProviderReviewsSectionProps = {
    /** 'profile' = Scandio Pro profile (slug-based); 'cached' = Google-only provider (place_id-based) */
    mode: 'profile' | 'cached';
    providerName: string;
    providerProfileSlug?: string | null;
    placeId?: string | null;
    /** Optional initial ScanHere/Scandio reviews from the server render */
    initialCustomerReviews?: CustomerReview[];
    /** Summary text to show at the top of the Reviews tab */
    reviewSummary: string | null;
    /** For Scandio Pro profiles: per-metric scores from provider_profiles (tidiness = cleanliness, cleanup = cleanup) */
    profileMetrics?: {
        punctuality: number | null;
        cleanliness: number | null;
        professionalism: number | null;
        cleanup: number | null;
    } | null;
    /** For cached providers: Gemini-assigned review categories, keyed by category name */
    reviewCategories?: Partial<Record<ReviewCategory, number[]>>;
    /** Google reviews (from cached_providers / Places) */
    googleReviews?: GoogleReview[];
};

function formatDate(date: string): string {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-ZA', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function formatGoogleRelativeDate(relative?: string | null): string {
    if (!relative) return '';
    const text = relative.trim().toLowerCase();
    const now = new Date();

    const yearMatch = text.match(/(\d+)\s+year/);
    if (yearMatch) {
        const years = Number.parseInt(yearMatch[1] ?? '0', 10);
        if (!Number.isNaN(years) && years > 0) {
            const d = new Date(now);
            d.setFullYear(d.getFullYear() - years);
            return d.toLocaleDateString('en-ZA', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            });
        }
    }

    const monthMatch = text.match(/(\d+)\s+month/);
    if (monthMatch) {
        const months = Number.parseInt(monthMatch[1] ?? '0', 10);
        if (!Number.isNaN(months) && months > 0) {
            const d = new Date(now);
            d.setMonth(d.getMonth() - months);
            return d.toLocaleDateString('en-ZA', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            });
        }
    }

    const weekMatch = text.match(/(\d+)\s+week/);
    if (weekMatch) {
        const weeks = Number.parseInt(weekMatch[1] ?? '0', 10);
        if (!Number.isNaN(weeks) && weeks > 0) {
            const d = new Date(now);
            d.setDate(d.getDate() - weeks * 7);
            return d.toLocaleDateString('en-ZA', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            });
        }
    }

    const dayMatch = text.match(/(\d+)\s+day/);
    if (dayMatch) {
        const days = Number.parseInt(dayMatch[1] ?? '0', 10);
        if (!Number.isNaN(days) && days > 0) {
            const d = new Date(now);
            d.setDate(d.getDate() - days);
            return d.toLocaleDateString('en-ZA', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            });
        }
    }

    return relative;
}

function formatReviewerName(name: string | null | undefined, fallback: string): string {
    if (!name) return fallback;
    const trimmed = name.trim();
    if (!trimmed) return fallback;
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) return parts[0]!;
    const first = parts[0]!;
    const last = parts[parts.length - 1]!;
    const initial = last.charAt(0).toUpperCase();
    return `${first} ${initial}.`;
}

function StarRating({ rating }: { rating: number | null | undefined }) {
    if (typeof rating !== 'number' || Number.isNaN(rating) || rating <= 0) return null;
    const clamped = Math.max(0, Math.min(5, rating));
    const fullStars = Math.round(clamped);
    const totalStars = 5;
    return (
        <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5">
                {Array.from({ length: totalStars }).map((_, i) => (
                    <StarFill
                        // eslint-disable-next-line react/no-array-index-key
                        key={i}
                        className={`size-4 ${i < fullStars ? 'text-yellow-500' : 'text-muted-foreground/20'}`}
                        aria-hidden
                    />
                ))}
            </div>
            <span className="text-xs font-medium text-foreground">{clamped.toFixed(1)}</span>
        </div>
    );
}

export function ProviderReviewsSection({
    mode,
    providerName,
    providerProfileSlug,
    placeId,
    initialCustomerReviews,
    reviewSummary,
    profileMetrics,
    reviewCategories,
    googleReviews,
}: ProviderReviewsSectionProps) {
    const [customerReviews, setCustomerReviews] = useState<CustomerReview[]>(
        initialCustomerReviews ?? []
    );
    const [loadingCustomerReviews, setLoadingCustomerReviews] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [expandedGoogle, setExpandedGoogle] = useState<Record<number, boolean>>({});

    // Fetch approved customer reviews for this provider (slug or place_id)
    useEffect(() => {
        const params =
            mode === 'profile'
                ? providerProfileSlug
                    ? `slug=${encodeURIComponent(providerProfileSlug)}`
                    : null
                : placeId
                ? `place_id=${encodeURIComponent(placeId)}`
                : null;
        if (!params) return;

        setLoadingCustomerReviews(true);
        fetch(`/api/reviews?${params}`)
            .then((res) => res.json())
            .then((data) => {
                if (Array.isArray(data.reviews)) {
                    setCustomerReviews(data.reviews as CustomerReview[]);
                }
            })
            .catch(() => {
                // swallow; we already have any server-provided data
            })
            .finally(() => setLoadingCustomerReviews(false));
    }, [mode, providerProfileSlug, placeId]);

    function categoryDisplayLabel(cat: ReviewCategory): string {
        if (cat === 'Accuracy') return 'Quote Accuracy';
        return cat;
    }

    const CATEGORY_ORDER: ReviewCategory[] = ['Punctuality', 'Professionalism', 'Cleanliness', 'Accuracy'];

    const categoryStatsForCached = (() => {
        if (!googleReviews || !reviewCategories) return [];
        return CATEGORY_ORDER.map((cat) => {
            const indices = reviewCategories[cat] ?? [];
            const ratings = indices
                .map((i) => googleReviews[i]?.rating)
                .filter((r): r is number => typeof r === 'number');
            const avg =
                ratings.length > 0
                    ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
                    : null;
            return {
                key: cat,
                label: categoryDisplayLabel(cat),
                count: indices.length,
                average: avg,
            };
        });
    })();

    const profileMetricCards =
        profileMetrics && mode === 'profile'
            ? [
                  { key: 'punctuality', label: 'Punctuality', value: profileMetrics.punctuality },
                  { key: 'cleanliness', label: 'Cleanliness', value: profileMetrics.cleanliness },
                  {
                      key: 'professionalism',
                      label: 'Professionalism',
                      value: profileMetrics.professionalism,
                  },
                  { key: 'accuracy', label: 'Quote Accuracy', value: profileMetrics.cleanup },
              ]
            : [];

    const hasBreakdown =
        (mode === 'profile' && profileMetricCards.length > 0) ||
        (mode === 'cached' && categoryStatsForCached.length > 0);

    function BreakdownPopover(props: { reviewIndex?: number; review?: CustomerReview | GoogleReview }) {
        if (!hasBreakdown) return null;
        const review = props.review;
        const reviewIdx = props.reviewIndex;

        const googleMentioned =
            mode === 'cached' && typeof reviewIdx === 'number'
                ? CATEGORY_ORDER.filter((cat) => (reviewCategories?.[cat] ?? []).includes(reviewIdx))
                : [];

        const scandioRatings = (review as CustomerReview | undefined)?.category_ratings ?? null;

        const showScandioBreakdown =
            mode === 'profile' && scandioRatings && typeof scandioRatings === 'object';

        const showGoogleBreakdown =
            mode === 'cached' && typeof reviewIdx === 'number' && googleMentioned.length > 0;

        if (!showScandioBreakdown && !showGoogleBreakdown) return null;

        const googleAvgByKey = new Map(categoryStatsForCached.map((c) => [c.key, c.average] as const));

        return (
            <Popover>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground hover:bg-muted"
                        aria-label="View review breakdown"
                    >
                        <Eye className="size-4" aria-hidden />
                    </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 text-xs">
                    <PopoverHeader>
                        <PopoverTitle>Review breakdown</PopoverTitle>
                        <PopoverDescription>
                            Breakdown for this specific review.
                        </PopoverDescription>
                    </PopoverHeader>
                    <div className="mt-3 space-y-1.5">
                        {showScandioBreakdown && (
                            <>
                                {[
                                    { label: 'Punctuality', value: scandioRatings?.punctuality ?? null },
                                    { label: 'Professionalism', value: scandioRatings?.professionalism ?? null },
                                    { label: 'Cleanliness', value: scandioRatings?.tidiness ?? null },
                                    { label: 'Quote Accuracy', value: scandioRatings?.quote_accuracy ?? null },
                                ].map((row) => (
                                    <div
                                        key={row.label}
                                        className="flex items-center justify-between rounded-sm bg-muted/40 px-2 py-1"
                                    >
                                        <span className="text-[11px] font-medium text-foreground">
                                            {row.label}
                                        </span>
                                        <span className="text-[11px] text-muted-foreground">
                                            {typeof row.value === 'number' ? row.value.toFixed(1) : '—'}
                                        </span>
                                    </div>
                                ))}
                            </>
                        )}

                        {showGoogleBreakdown && (
                            <>
                                {googleMentioned.map((cat) => (
                                    <div
                                        key={cat}
                                        className="flex items-center justify-between rounded-sm bg-muted/40 px-2 py-1"
                                    >
                                        <span className="text-[11px] font-medium text-foreground">
                                            {categoryDisplayLabel(cat)}
                                        </span>
                                        <span className="text-[11px] text-muted-foreground">
                                            {googleAvgByKey.get(cat) != null
                                                ? `${googleAvgByKey.get(cat)!.toFixed(1)}/5`
                                                : 'Mentioned'}
                                        </span>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </PopoverContent>
            </Popover>
        );
    }

    const summaryAndCategoriesBlock = (
        <div className="space-y-6">
            <div className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Company Reviews</h2>
                {reviewSummary && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {reviewSummary}
                    </p>
                )}
                <Button className="w-full" variant="secondary" onClick={() => setDialogOpen(true)}>
                    Add Review
                </Button>
            </div>

            {mode === 'profile' && profileMetricCards.length > 0 && (
                <div className="grid gap-6 sm:grid-cols-2">
                    {profileMetricCards.map((card) => (
                        <Card
                            key={card.key}
                            className="border-input/75 bg-card rounded-lg shadow-none p-0"
                        >
                            <CardContent className="flex flex-col gap-1 p-0 p-4">
                                <p className="text-xs font-medium text-muted-foreground">
                                    {card.label}
                                </p>
                                <p className="text-lg font-semibold text-foreground">
                                    {typeof card.value === 'number' && card.value > 0
                                        ? `${card.value.toFixed(1)}/10`
                                        : 'Not enough data'}
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {mode === 'cached' && categoryStatsForCached.length > 0 && (
                <div className="grid gap-6 sm:grid-cols-2">
                    {categoryStatsForCached.map((cat) => (
                        <Card
                            key={cat.key}
                            className="border-input/75 bg-card rounded-lg shadow-none p-0"
                        >
                            <CardContent className="flex flex-col gap-1 p-4">
                                <p className="text-sm font-medium text-muted-foreground">
                                    {cat.label}
                                </p>
                                <p className="text-lg font-semibold text-foreground">
                                    {cat.average != null ? `${cat.average.toFixed(1)}/5` : '—'}
                                </p>
                                {cat.count === 0 ? (
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span>No mentions</span>
                                        <span>0 reviews</span>
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        {`${cat.count} review${cat.count === 1 ? '' : 's'} mention this`}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );

    const reviewsBlock = (
        <div className="space-y-6">
            <section className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">
                    Scandio Reviews
                </h3>
                {loadingCustomerReviews && customerReviews.length === 0 ? (
                    <p className="text-sm text-muted-foreground -mt-2">Loading Scandio Reviews...</p>
                ) : customerReviews.length === 0 ? (
                    <p className="text-sm text-muted-foreground -mt-2">
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam.
                    </p>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-1">
                        {customerReviews.map((r) => (
                            <div
                                key={r.id}
                                className="flex flex-col gap-3 rounded-md border border-border/40 bg-card p-3 shadow-none transition-all duration-250 hover:border-border/75"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {formatReviewerName(r.reviewer_name, 'Scandio user')}
                                        </p>
                                        <div className="mt-1 flex items-center justify-start gap-2">
                                            <StarRating rating={r.rating} />
                                            <BreakdownPopover review={r} />
                                        </div>
                                    </div>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {formatDate(r.created_at)}
                                    </span>
                                </div>
                                <blockquote className="border-l-2 border-input pl-3">
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {r.body}
                                    </p>
                                </blockquote>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <Separator />

            <Input placeholder="Search Reviews" className="text-sm" />

            <section className="space-y-6">
                {!googleReviews || googleReviews.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam.
                    </p>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-1">
                        {googleReviews.map((r, i) => (
                            <div
                                key={`${r.authorName ?? 'google'}-${i}`}
                                className="flex flex-col gap-3 rounded-md border border-border/40 bg-card p-3 shadow-none transition-all duration-250 hover:border-border/75"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {formatReviewerName(r.authorName, 'Google user')}
                                        </p>
                                        <div className="mt-1 flex items-center justify-start gap-2">
                                            <StarRating rating={r.rating} />
                                            <BreakdownPopover reviewIndex={i} review={r} />
                                        </div>
                                    </div>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {r.published_at
                                            ? formatDate(r.published_at)
                                            : formatGoogleRelativeDate(
                                                  r.relativePublishTimeDescription
                                              )}
                                    </span>
                                </div>
                                <blockquote className="border-l-2 border-input pl-3">
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {(() => {
                                            const text = r.text || '';
                                            const isLong = text.length > 220;
                                            const isExpanded = expandedGoogle[i];
                                            if (!isLong || isExpanded) return text;
                                            return `${text.slice(0, 220).trimEnd()}…`;
                                        })()}
                                        {r.text && r.text.length > 220 && (
                                            <>
                                                {' '}
                                                <button
                                                    type="button"
                                                    className="inline text-xs font-medium text-foreground/70 hover:text-foreground"
                                                    onClick={() =>
                                                        setExpandedGoogle((prev) => ({
                                                            ...prev,
                                                            [i]: !prev[i],
                                                        }))
                                                    }
                                                >
                                                    {expandedGoogle[i] ? 'Show less' : 'Read more'}
                                                </button>
                                            </>
                                        )}
                                    </p>
                                </blockquote>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );

    return (
        <section className="space-y-6">
            {/* Mobile: stack with review summary at top */}
            <div className="flex flex-col gap-6 lg:hidden">
                {summaryAndCategoriesBlock}
                {reviewsBlock}
            </div>

            {/* Desktop: row — left summary + categories, right reviews */}
            <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-8">
                <div className="min-w-0">
                    <div className="sticky top-20 max-h-[calc(100vh-5rem)] overflow-auto pr-2">
                        {summaryAndCategoriesBlock}
                    </div>
                </div>
                <div className="min-w-0">{reviewsBlock}</div>
            </div>

            <WriteReviewDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                providerName={providerName}
                placeId={mode === 'cached' ? placeId ?? null : null}
                providerProfileSlug={mode === 'profile' ? providerProfileSlug ?? null : null}
            />
        </section>
    );
}

