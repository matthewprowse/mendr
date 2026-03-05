'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { ReviewCategory } from '@/lib/ai-review-metrics';
import { WriteReviewDialog } from '@/components/write-review-dialog';
import { StarFill } from '@/lib/icons';

type CustomerReview = {
    id: string;
    reviewer_name?: string | null;
    rating: number | null;
    title?: string | null;
    body: string;
    created_at: string;
};

type GoogleReview = {
    text: string;
    rating: number | null;
    relativePublishTimeDescription?: string | null;
    authorName?: string | null;
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
    /** For Scandio Pro profiles: per-metric scores from provider_profiles */
    profileMetrics?: {
        punctuality: number | null;
        cleanliness: number | null;
        professionalism: number | null;
        categoriesAccuracy: number | null;
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

    const categoryStatsForCached = (() => {
        if (!googleReviews || !reviewCategories) return [];
        const ordered: ReviewCategory[] = [
            'Punctuality',
            'Tidiness',
            'Professionalism',
            'Quality',
            'Value',
        ];
        return ordered.map((cat) => {
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
                label: cat,
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
                  {
                      key: 'categoriesAccuracy',
                      label: 'Accuracy of the categories',
                      value: profileMetrics.categoriesAccuracy,
                  },
              ]
            : [];

    return (
        <section className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <h2 className="text-sm font-semibold tracking-tight text-foreground">
                        Reviews for {providerName}
                    </h2>
                    {reviewSummary && (
                        <p className="max-w-2xl text-sm text-muted-foreground">{reviewSummary}</p>
                    )}
                </div>
                <Button size="sm" className="w-full sm:w-auto" onClick={() => setDialogOpen(true)}>
                    Add review
                </Button>
            </div>

            {/* Category / metrics grid */}
            {mode === 'profile' && profileMetricCards.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {profileMetricCards.map((card) => (
                        <Card key={card.key} className="border-border/70 bg-card">
                            <CardContent className="flex flex-col gap-1.5 p-3">
                                <p className="text-xs font-medium text-muted-foreground">
                                    {card.label}
                                </p>
                                <p className="text-lg font-semibold text-foreground">
                                    {typeof card.value === 'number'
                                        ? `${card.value.toFixed(1)}/10`
                                        : 'Not enough data'}
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {mode === 'cached' && categoryStatsForCached.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {categoryStatsForCached.map((cat) => (
                        <Card key={cat.key} className="border-border/70 bg-card">
                            <CardContent className="flex flex-col gap-1.5 p-3">
                                <p className="text-xs font-medium text-muted-foreground">
                                    {cat.label}
                                </p>
                                <p className="text-lg font-semibold text-foreground">
                                    {cat.average != null ? `${cat.average.toFixed(1)}/5` : '—'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {cat.count === 0
                                        ? 'No mentions yet'
                                        : `${cat.count} review${cat.count === 1 ? '' : 's'} mention this`}
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* ScanHere / Scandio reviews then Google reviews, styled like marketing testimonials */}
            <div className="space-y-6">
                <section className="space-y-3">
                    <h3 className="text-sm font-semibold tracking-tight text-foreground">
                        ScanHere reviews
                    </h3>
                    {loadingCustomerReviews && customerReviews.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Loading reviews…</p>
                    ) : customerReviews.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                            No ScanHere reviews have been added for this provider yet.
                        </p>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {customerReviews.map((r) => (
                                <div
                                    key={r.id}
                                    className="flex flex-col gap-4 rounded-md border border-border/50 bg-card hover:border-border/75 transition-all duration-250 p-4 shadow-none"
                                >
                                    <blockquote className="border-l-2 border-input pl-3">
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            {r.body}
                                        </p>
                                    </blockquote>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium">
                                            {r.reviewer_name || 'ScanHere user'}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {formatDate(r.created_at)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="space-y-3">
                    <h3 className="text-sm font-semibold tracking-tight text-foreground">
                        Google reviews
                    </h3>
                    {!googleReviews || googleReviews.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                            No Google reviews are available for this provider yet.
                        </p>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {googleReviews.map((r, i) => (
                                <div
                                    key={`${r.authorName ?? 'google'}-${i}`}
                                    className="flex flex-col gap-4 rounded-md border border-border/50 bg-card hover:border-border/75 transition-all duration-250 p-4 shadow-none"
                                >
                                    <blockquote className="border-l-2 border-input pl-3">
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            {(() => {
                                                const text = r.text || '';
                                                const isLong = text.length > 220;
                                                const isExpanded = expandedGoogle[i];
                                                if (!isLong || isExpanded) return text;
                                                return `${text.slice(0, 220).trimEnd()}…`;
                                            })()}
                                        </p>
                                        {r.text && r.text.length > 220 && (
                                            <button
                                                type="button"
                                                className="mt-1 text-xs font-medium text-primary hover:underline"
                                                onClick={() =>
                                                    setExpandedGoogle((prev) => ({
                                                        ...prev,
                                                        [i]: !prev[i],
                                                    }))
                                                }
                                            >
                                                {expandedGoogle[i] ? 'Show less' : 'Read more'}
                                            </button>
                                        )}
                                    </blockquote>
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-sm font-medium">
                                                {r.authorName || 'Google user'}
                                            </span>
                                            {typeof r.rating === 'number' && (
                                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <StarFill
                                                        className="size-3 text-yellow-500"
                                                        aria-hidden
                                                    />
                                                    <span>{r.rating.toFixed(1)}</span>
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            {formatGoogleRelativeDate(
                                                r.relativePublishTimeDescription
                                            )}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
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

