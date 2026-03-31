import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { SCANDIO_CATEGORY_ROWS, REVIEWS_PAGE_SIZE } from '../_constants/page';
import type { CategoryKey, ReviewCard } from '../_types/page';
import { CategorySliderRow } from './category-slider-row';
import { ReviewsPaginationFooter } from './pagination-footer';
import { StarRatingDisplay } from './star-rating';

export function ProReviewsTab(props: {
    isOperatingHoursLoading: boolean;
    providerSummary: string | null;
    isReviewsLoading: boolean;
    scandioReviewsCount: number;
    googleReviewsCount: number;
    scandioCategoryAggregates: Record<CategoryKey, number | null>;
    resolvedProviderId: string | null;
    shareOpen: boolean;
    setShareOpen: (open: boolean) => void;
    reviewerName: string;
    setReviewerName: (v: string) => void;
    reviewTitle: string;
    setReviewTitle: (v: string) => void;
    reviewBody: string;
    setReviewBody: (v: string) => void;
    categoryRatings: Record<CategoryKey, number>;
    setCategoryRatings: React.Dispatch<React.SetStateAction<Record<CategoryKey, number>>>;
    categoryAverage: number;
    submitError: string | null;
    submitSuccess: boolean;
    isSubmitting: boolean;
    onShareSubmit: (e: React.FormEvent) => void;
    scandioReviewsShown: ReviewCard[];
    googleReviewsShown: ReviewCard[];
    scandioReviewCardsLength: number;
    googleReviewCardsLength: number;
    scandioReviewsVisibleCount: number;
    googleReviewsVisibleCount: number;
    setScandioReviewsVisibleCount: React.Dispatch<React.SetStateAction<number>>;
    setGoogleReviewsVisibleCount: React.Dispatch<React.SetStateAction<number>>;
    providerGooglePlaceId: string | null;
}) {
    const {
        isOperatingHoursLoading,
        providerSummary,
        isReviewsLoading,
        scandioReviewsCount,
        googleReviewsCount,
        scandioCategoryAggregates,
        resolvedProviderId,
        shareOpen,
        setShareOpen,
        reviewerName,
        setReviewerName,
        reviewTitle,
        setReviewTitle,
        reviewBody,
        setReviewBody,
        categoryRatings,
        setCategoryRatings,
        categoryAverage,
        submitError,
        submitSuccess,
        isSubmitting,
        onShareSubmit,
        scandioReviewsShown,
        googleReviewsShown,
        scandioReviewCardsLength,
        googleReviewCardsLength,
        scandioReviewsVisibleCount,
        googleReviewsVisibleCount,
        setScandioReviewsVisibleCount,
        setGoogleReviewsVisibleCount,
        providerGooglePlaceId,
    } = props;

    const renderStarRating = (rating: unknown) => {
        const n = typeof rating === 'number' ? rating : typeof rating === 'string' ? Number.parseFloat(rating) : NaN;
        if (!Number.isFinite(n)) return null;
        return <StarRatingDisplay rating={Math.max(0, Math.min(5, n))} size="sm" />;
    };

    const reviewCardClass = 'border border-border/75 rounded-lg p-4 flex flex-col gap-2';
    const reviewHeaderClass = 'flex items-start justify-between gap-2';
    const reviewMetaRowClass = 'flex items-center gap-2';
    const reviewAvatarClass =
        'h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-sm font-medium text-muted-foreground';

    return (
        <div className="flex flex-col gap-6 mt-6">
            <div className="flex flex-col gap-2">
                <h3 className="text-lg text-foreground font-bold">Reviews</h3>
                {isOperatingHoursLoading ? (
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-11/12" />
                    </div>
                ) : providerSummary?.trim() ? (
                    <p className="text-sm text-foreground">{providerSummary.trim()}</p>
                ) : (
                    <p className="text-sm text-muted-foreground">No Scandio summary yet.</p>
                )}
            </div>

            {(isReviewsLoading || scandioReviewsCount > 0) && (
                <div className="grid grid-cols-2 gap-2">
                    {isReviewsLoading
                        ? SCANDIO_CATEGORY_ROWS.map((row) => (
                              <div key={row.key} className="flex flex-col px-4 p-3 border border-input/75 rounded-lg">
                                  <Skeleton className="mb-2 h-4 w-28" />
                                  <Skeleton className="h-7 w-10" />
                              </div>
                          ))
                        : SCANDIO_CATEGORY_ROWS.map((row) => {
                              const avg = scandioCategoryAggregates[row.key];
                              const display = avg != null && Number.isFinite(avg) ? avg.toFixed(1) : '—';
                              return (
                                  <div key={row.key} className="flex flex-col px-4 p-3 border border-input/75 rounded-lg">
                                      <p className="text-sm text-muted-foreground font-medium">{row.label}</p>
                                      <p className="text-lg text-foreground font-bold">{display}</p>
                                  </div>
                              );
                          })}
                </div>
            )}

            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <div className="flex flex-row items-center justify-between gap-3">
                        <h6 className="text-md text-foreground font-bold">Scandio Reviews</h6>
                        {isReviewsLoading ? (
                            <Skeleton className="h-6 w-9 rounded-full" />
                        ) : (
                            <Badge variant="secondary">{scandioReviewsCount}</Badge>
                        )}
                    </div>
                    <Button
                        type="button"
                        variant="secondary"
                        className="h-10"
                        disabled={!resolvedProviderId}
                        onClick={() => setShareOpen(true)}
                    >
                        Share Experience
                    </Button>
                </div>

                <Dialog open={shareOpen} onOpenChange={setShareOpen}>
                    <DialogContent showCloseButton={false} className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-lg">
                        <form onSubmit={onShareSubmit} className="flex flex-col gap-6">
                            <DialogHeader className="text-left gap-3">
                                <DialogTitle className="text-left leading-none">Share Experience</DialogTitle>
                                <DialogDescription>
                                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="flex flex-col gap-3">
                                <Label htmlFor="reviewer-name">Full Name</Label>
                                <Input value={reviewerName} onChange={(e) => setReviewerName(e.target.value)} className="text-xs h-10" required />
                            </div>
                            <div className="flex flex-col gap-3">
                                <Label htmlFor="review-title">Experience Title</Label>
                                <Input value={reviewTitle} onChange={(e) => setReviewTitle(e.target.value)} className="text-xs h-10" />
                            </div>
                            <div className="flex flex-col gap-3">
                                <Label htmlFor="review-body">Experience Description</Label>
                                <Textarea value={reviewBody} onChange={(e) => setReviewBody(e.target.value)} className="text-xs min-h-[64px]" required />
                            </div>
                            <Separator />
                            <div className="flex flex-col items-center justify-between gap-3">
                                <Label>Average</Label>
                                <StarRatingDisplay rating={Math.max(0, Math.min(5, categoryAverage))} size="md" />
                            </div>
                            <div className="flex flex-col gap-4">
                                {SCANDIO_CATEGORY_ROWS.map((row) => (
                                    <CategorySliderRow
                                        key={row.key}
                                        rowKey={row.key}
                                        label={row.label}
                                        value={categoryRatings[row.key]}
                                        onChange={(n) => setCategoryRatings((prev) => ({ ...prev, [row.key]: n }))}
                                    />
                                ))}
                            </div>
                            {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}
                            {submitSuccess ? <p className="text-sm text-foreground">Thanks — your review was submitted and will appear after moderation.</p> : null}
                            <DialogFooter className="w-full flex-row gap-2 sm:justify-stretch">
                                <Button type="button" variant="ghost" className="h-10 min-h-10 flex-1" onClick={() => setShareOpen(false)} disabled={isSubmitting}>Cancel</Button>
                                <Button type="submit" className="h-10 min-h-10 flex-1" disabled={isSubmitting || !resolvedProviderId}>{isSubmitting ? 'Submitting…' : 'Submit Experience'}</Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                {isReviewsLoading ? (
                    Array.from({ length: 2 }).map((_, i) => (
                        <div key={`scandio-review-skeleton-${i}`} className={reviewCardClass}>
                            <div className={reviewHeaderClass}>
                                <div className={reviewMetaRowClass}>
                                    <Skeleton className="h-9 w-9 rounded-full" />
                                    <div className="flex flex-col gap-2">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-24" />
                                    </div>
                                </div>
                                <Skeleton className="h-4 w-20" />
                            </div>
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-11/12" />
                        </div>
                    ))
                ) : scandioReviewsShown.length > 0 ? (
                    <>
                        {scandioReviewsShown.map((r) => (
                            <div key={r.id} className={reviewCardClass}>
                                <div className={reviewHeaderClass}>
                                    <div className={reviewMetaRowClass}>
                                        <div className={reviewAvatarClass}>{r.initials}</div>
                                        <div className="flex flex-col">
                                            <p className="text-sm font-medium text-foreground">{r.fullName}</p>
                                            <p className="text-[11px] text-muted-foreground">{r.sentAt}</p>
                                        </div>
                                    </div>
                                    {renderStarRating(r.rating)}
                                </div>
                                {r.title ? <p className="text-sm font-semibold text-foreground">{r.title}</p> : null}
                                <p className="text-sm text-muted-foreground leading-relaxed">{r.body}</p>
                            </div>
                        ))}
                        <ReviewsPaginationFooter
                            showingCount={scandioReviewsVisibleCount}
                            total={scandioReviewCardsLength}
                            categoryLabel="Scandio Reviews"
                            onViewMore={() =>
                                setScandioReviewsVisibleCount((prev) => Math.min(prev + REVIEWS_PAGE_SIZE, scandioReviewCardsLength))
                            }
                        />
                    </>
                ) : (
                    <p className="text-sm text-muted-foreground">No Scandio Reviews</p>
                )}
            </div>

            <div className="flex flex-col gap-6">
                <div className="flex flex-row items-center justify-between gap-3">
                    <h6 className="text-md text-foreground font-bold">Google Reviews</h6>
                    {isReviewsLoading ? (
                        <Skeleton className="h-6 w-9 rounded-full" />
                    ) : (
                        <Badge variant="secondary">{googleReviewsCount}</Badge>
                    )}
                </div>
                {isReviewsLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <div key={`google-review-skeleton-${i}`} className={reviewCardClass}>
                            <div className={reviewHeaderClass}>
                                <div className={reviewMetaRowClass}>
                                    <Skeleton className="h-9 w-9 rounded-full" />
                                    <div className="flex flex-col gap-2">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-24" />
                                    </div>
                                </div>
                                <Skeleton className="h-4 w-12" />
                            </div>
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-11/12" />
                        </div>
                    ))
                ) : googleReviewsShown.length > 0 ? (
                    <>
                        {googleReviewsShown.map((r) => (
                            <div key={r.id} className={reviewCardClass}>
                                <div className={reviewHeaderClass}>
                                    <div className={reviewMetaRowClass}>
                                        <div className={reviewAvatarClass}>{r.initials}</div>
                                        <div className="flex flex-col">
                                            <p className="text-sm font-medium text-foreground">{r.fullName}</p>
                                            <p className="text-[11px] text-muted-foreground">{r.sentAt}</p>
                                        </div>
                                    </div>
                                    {renderStarRating(r.rating)}
                                </div>
                                <p className="text-sm text-muted-foreground leading-relaxed">{r.body}</p>
                            </div>
                        ))}
                        {providerGooglePlaceId ? (
                            <Button variant="secondary" className="h-10 w-full" asChild>
                                <a
                                    href={`https://www.google.com/maps/place/?q=place_id:${providerGooglePlaceId.replace(
                                        /^places\//,
                                        ''
                                    )}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    View More Google Reviews
                                </a>
                            </Button>
                        ) : null}
                    </>
                ) : (
                    <p className="text-sm text-muted-foreground">No Google reviews saved yet.</p>
                )}
            </div>
        </div>
    );
}
