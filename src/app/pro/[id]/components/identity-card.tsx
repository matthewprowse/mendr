'use client';

import { Star, ShieldCheck, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBusinessName } from '@/lib/utils';

export type IdentityCardProps = {
    isLoading: boolean;
    name: string;
    rating: number | null;
    ratingCount: number;
    isOpen: boolean | null;
    nextOpensAt: string | null;
    yearsInBusiness: number | null;
    mendrReviewCount?: number | null;
};

export function IdentityCard({
    isLoading,
    name,
    rating,
    ratingCount,
    isOpen,
    nextOpensAt,
    yearsInBusiness,
    mendrReviewCount,
}: IdentityCardProps) {
    const displayName = formatBusinessName(name) || name || 'Pro';
    const verified = (mendrReviewCount ?? 0) > 0;
    const yearsLabel =
        typeof yearsInBusiness === 'number' && yearsInBusiness > 0
            ? `${yearsInBusiness} ${yearsInBusiness === 1 ? 'yr' : 'yrs'} in business`
            : null;
    const openLabel = (() => {
        if (isOpen === true) return 'Open now';
        if (isOpen === false) {
            return nextOpensAt ? `Closed · opens ${nextOpensAt}` : 'Closed';
        }
        return null;
    })();

    return (
        <section
            className="rounded-lg border border-border bg-card p-4"
            aria-labelledby="contractor-identity-heading"
        >
            <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-2">
                        <h1
                            id="contractor-identity-heading"
                            className="truncate text-2xl font-semibold leading-snug text-foreground"
                        >
                            {isLoading ? <Skeleton className="h-8 w-56" /> : displayName}
                        </h1>
                        {!isLoading && verified ? (
                            <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                <ShieldCheck size={12} fill="currentColor" aria-hidden />
                                Verified on Mendr
                            </div>
                        ) : null}
                    </div>
                    {!isLoading && openLabel ? (
                        <span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground">
                            {openLabel}
                        </span>
                    ) : null}
                </div>

                {isLoading ? (
                    <Skeleton className="h-5 w-64" />
                ) : (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-foreground">
                        {rating != null ? (
                            <span className="inline-flex items-center gap-1">
                                <Star size={14} fill="currentColor" className="text-yellow-500" aria-hidden />
                                <span className="font-semibold tabular-nums">{rating.toFixed(1)}</span>
                                {ratingCount > 0 ? (
                                    <span className="text-muted-foreground">
                                        · {ratingCount.toLocaleString()}{' '}
                                        {ratingCount === 1 ? 'review' : 'reviews'}
                                    </span>
                                ) : null}
                            </span>
                        ) : (
                            <span className="text-muted-foreground">No rating yet</span>
                        )}
                        {yearsLabel ? (
                            <span className="text-muted-foreground inline-flex items-center gap-1">
                                <Clock size={12} strokeWidth={2.5} aria-hidden />
                                {yearsLabel}
                            </span>
                        ) : null}
                    </div>
                )}

            </div>
        </section>
    );
}
