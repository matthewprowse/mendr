import type { MendrPublicReview, MendrRatingSummary } from '@/lib/providers/contractor-profile-server';

/**
 * Public-facing Mendr-side rating + reviews block on the contractor profile.
 *
 * Reads from `job_outcomes` (denormalised on `providers.mendr_rating`).
 * When the provider has < 3 ratings we show a "New on Mendr" badge rather
 * than a misleading 5★ average from one outcome.
 *
 * If the most recent reviews carry a `contractor_reply`, we render the
 * reply as an indented card directly beneath the homeowner outcome.
 */

const MENDR_MIN_COUNT = 3;

function formatDate(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function StarRow({ rating }: { rating: number | null }) {
    const filled = rating != null ? Math.round(rating) : 0;
    const total = 5;
    return (
        <span
            aria-label={rating != null ? `${rating.toFixed(1)} out of 5` : 'No rating'}
            className="inline-flex items-center gap-0.5 text-amber-500"
        >
            {Array.from({ length: total }).map((_, i) => (
                <span
                    key={i}
                    aria-hidden="true"
                    className={i < filled ? 'text-amber-500' : 'text-gray-300'}
                >
                    ★
                </span>
            ))}
        </span>
    );
}

function ReviewItem({
    review,
    businessName,
}: {
    review: MendrPublicReview;
    businessName: string;
}) {
    return (
        <li className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
                <StarRow rating={review.rating} />
                <span className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</span>
            </div>
            {review.outcome ? (
                <p className="text-sm text-foreground">{review.outcome}</p>
            ) : (
                <p className="text-sm italic text-muted-foreground">Verified outcome via Mendr.</p>
            )}
            {review.contractorReply ? (
                <div className="ml-4 rounded-lg border border-border bg-muted p-3">
                    <p className="text-xs font-semibold text-foreground">
                        {businessName} replied
                        {review.contractorReplyAt
                            ? ` · ${formatDate(review.contractorReplyAt)}`
                            : null}
                    </p>
                    <p className="mt-1 text-sm text-foreground">{review.contractorReply}</p>
                </div>
            ) : null}
        </li>
    );
}

export function MendrReviewsBlock({
    mendr,
    businessName,
}: {
    mendr: MendrRatingSummary;
    businessName: string;
}) {
    const enoughForAverage = mendr.count >= MENDR_MIN_COUNT;

    return (
        <section
            className="rounded-lg border border-border bg-card p-4"
            aria-labelledby="mendr-reviews-heading"
        >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2
                    id="mendr-reviews-heading"
                    className="text-lg font-semibold text-foreground"
                >
                    Mendr verified reviews
                </h2>
                {enoughForAverage && mendr.rating != null ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <StarRow rating={mendr.rating} />
                        <span>
                            {mendr.rating.toFixed(1)} ({mendr.count}{' '}
                            {mendr.count === 1 ? 'review' : 'reviews'})
                        </span>
                    </span>
                ) : (
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                        New on Mendr
                    </span>
                )}
            </div>

            {mendr.reviews.length === 0 ? (
                <p className="text-sm text-gray-600">
                    No homeowner reviews yet. Outcomes from completed Mendr jobs will appear
                    here.
                </p>
            ) : (
                <ul className="flex flex-col">
                    {mendr.reviews.map((r) => (
                        <ReviewItem key={r.id} review={r} businessName={businessName} />
                    ))}
                </ul>
            )}
        </section>
    );
}
