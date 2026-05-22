'use client';

import { Star, ShieldCheck, Clock } from '@phosphor-icons/react';
import { Skeleton } from '@/components/ui/skeleton';
import { INK } from '@/lib/design-tokens';
import { formatBusinessName } from '@/lib/utils';

const COMPANY_SIZE_LABEL: Record<'solo' | 'small' | 'mid' | 'large', string> = {
    solo: 'Solo operator',
    small: 'Small team (2–5)',
    mid: 'Mid team (6–20)',
    large: 'Large team (20+)',
};

export type IdentityCardProps = {
    isLoading: boolean;
    name: string;
    rating: number | null;
    ratingCount: number;
    isOpen: boolean | null;
    nextOpensAt: string | null;
    companySize: 'solo' | 'small' | 'mid' | 'large' | null;
    yearsInBusiness: number | null;
    scandioReviewCount?: number | null;
};

export function IdentityCard({
    isLoading,
    name,
    rating,
    ratingCount,
    isOpen,
    nextOpensAt,
    companySize,
    yearsInBusiness,
    scandioReviewCount,
}: IdentityCardProps) {
    const displayName = formatBusinessName(name) || name || 'Provider';
    const verified = (scandioReviewCount ?? 0) > 0;
    const sizeLabel = companySize ? COMPANY_SIZE_LABEL[companySize] : null;
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
            className="rounded-3xl border border-black/[0.07] bg-white p-4 sm:p-5"
            aria-labelledby="contractor-identity-heading"
        >
            <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-2">
                        <h1
                            id="contractor-identity-heading"
                            className="truncate text-2xl font-semibold leading-snug sm:text-3xl"
                            style={{ color: INK }}
                        >
                            {isLoading ? <Skeleton className="h-8 w-56" /> : displayName}
                        </h1>
                        {!isLoading && verified ? (
                            <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                                <ShieldCheck size={12} weight="fill" aria-hidden />
                                Verified on Mendr
                            </div>
                        ) : null}
                    </div>
                    {!isLoading && openLabel ? (
                        <span
                            className="shrink-0 rounded-full bg-black/[0.06] px-3 py-1 text-xs font-medium"
                            style={{ color: INK }}
                        >
                            {openLabel}
                        </span>
                    ) : null}
                </div>

                {isLoading ? (
                    <Skeleton className="h-5 w-64" />
                ) : (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm" style={{ color: INK }}>
                        {rating != null ? (
                            <span className="inline-flex items-center gap-1">
                                <Star size={14} weight="fill" className="text-yellow-500" aria-hidden />
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
                        {sizeLabel ? (
                            <span className="text-muted-foreground">· {sizeLabel}</span>
                        ) : null}
                        {yearsLabel ? (
                            <span className="text-muted-foreground inline-flex items-center gap-1">
                                <Clock size={12} weight="bold" aria-hidden />
                                {yearsLabel}
                            </span>
                        ) : null}
                    </div>
                )}

            </div>
        </section>
    );
}
