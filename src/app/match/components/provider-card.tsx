'use client';

/**
 * Match provider card (list + map-view featured card).
 *
 * Deliberately minimal per the match redesign: name + favourite, a rating /
 * review line, an Open/Closed status styled as a secondary button, a short
 * review summary, and two actions (Contact + View More). No photos, badges,
 * drive time, or address — those live on the contractor profile.
 *
 * `ProviderCardCarousel` is kept here (and exported) because the contractor
 * profile page reuses it; only the card body was simplified.
 */

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SaveProviderButton } from '@/components/save-provider-button';
import { cn, formatBusinessName } from '@/lib/utils';
import type { MatchProvider } from '@/features/match/contracts';

type ProviderCardCarouselProps = {
    images: NonNullable<MatchProvider['images']>;
    providerName: string;
    onImageSwipe?: (toIndex: number) => void;
};

export function ProviderCardCarousel({ images, providerName, onImageSwipe }: ProviderCardCarouselProps) {
    const [activeIdx, setActiveIdx] = useState(0);
    const trackRef = useRef<HTMLDivElement | null>(null);
    const lastReportedIdxRef = useRef(0);

    const total = images.length;
    const goTo = useCallback(
        (next: number) => {
            const clamped = Math.max(0, Math.min(total - 1, next));
            setActiveIdx(clamped);
            const track = trackRef.current;
            if (!track) return;
            const slide = track.children[clamped] as HTMLElement | undefined;
            slide?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
        },
        [total]
    );

    useEffect(() => {
        const track = trackRef.current;
        if (!track) return;
        let frame = 0;
        const onScroll = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const slideWidth = track.clientWidth || 1;
                const next = Math.round(track.scrollLeft / slideWidth);
                if (next !== activeIdx) setActiveIdx(next);
                if (next !== lastReportedIdxRef.current) {
                    lastReportedIdxRef.current = next;
                    onImageSwipe?.(next);
                }
            });
        };
        track.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            cancelAnimationFrame(frame);
            track.removeEventListener('scroll', onScroll);
        };
    }, [activeIdx, onImageSwipe]);

    return (
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-muted">
            <div
                ref={trackRef}
                className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                {images.map((img, idx) => (
                    <div
                        key={`${img.url}-${idx}`}
                        className="relative h-full w-full shrink-0 snap-start"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={img.url}
                            alt={img.caption ?? `${providerName} photo ${idx + 1}`}
                            className="h-full w-full object-cover"
                            loading={idx === 0 ? 'eager' : 'lazy'}
                            draggable={false}
                        />
                    </div>
                ))}
            </div>

            {total > 1 ? (
                <Fragment>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            goTo(activeIdx - 1);
                        }}
                        aria-label="Previous photo"
                        className={cn(
                            'absolute left-2 top-1/2 -translate-y-1/2 size-8 inline-flex items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur transition-opacity',
                            activeIdx === 0 ? 'opacity-0 pointer-events-none' : 'opacity-100'
                        )}
                    >
                        <ChevronLeft size={16} strokeWidth={2.5} />
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            goTo(activeIdx + 1);
                        }}
                        aria-label="Next photo"
                        className={cn(
                            'absolute right-2 top-1/2 -translate-y-1/2 size-8 inline-flex items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur transition-opacity',
                            activeIdx >= total - 1 ? 'opacity-0 pointer-events-none' : 'opacity-100'
                        )}
                    >
                        <ChevronRight size={16} strokeWidth={2.5} />
                    </button>

                    <div
                        className="pointer-events-none absolute bottom-2 left-0 right-0 flex justify-center gap-1.5"
                        aria-hidden="true"
                    >
                        {images.map((_, idx) => (
                            <span
                                key={idx}
                                className={cn(
                                    'h-1.5 rounded-full bg-white/90 transition-all',
                                    idx === activeIdx ? 'w-4 opacity-100' : 'w-1.5 opacity-70'
                                )}
                            />
                        ))}
                    </div>
                </Fragment>
            ) : null}
        </div>
    );
}

export type ProviderCardProps = {
    provider: MatchProvider;
    reviewCount: number;
    summary: string | null;
    summaryLoading: boolean;
    /** Tapping the card body marks it active (prioritises its review enrichment). Optional. */
    onSelect?: () => void;
    /** Opens the full contractor profile. */
    onViewMore: () => void;
    /** Slot for the Contact popover (keeps WhatsApp/phone/email tracking in the parent). */
    contactSlot: ReactNode;
};

export function ProviderCard({
    provider,
    reviewCount,
    summary,
    summaryLoading,
    onSelect,
    onViewMore,
    contactSlot,
}: ProviderCardProps) {
    const hasOpenStatus = typeof provider.isOpen === 'boolean';
    const ratingLabel = provider.rating != null ? provider.rating.toFixed(1) : 'New';

    return (
        <div
            onClick={onSelect}
            className={cn(
                'flex w-full flex-col gap-4 rounded-lg border border-border bg-card p-4 text-left',
                onSelect && 'cursor-pointer'
            )}
        >
            <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="flex-1 text-lg font-semibold leading-snug text-foreground">
                        {formatBusinessName(provider.name)}
                    </h3>
                    <SaveProviderButton
                        providerId={provider.providerId ?? null}
                        className="-mr-2 -mt-1 shrink-0"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                        <Star
                            size={16}
                            fill="currentColor"
                            className="text-yellow-500"
                            aria-hidden="true"
                        />
                        <span className="font-medium text-foreground">{ratingLabel}</span>
                        {reviewCount > 0 ? (
                            <span className="text-xs">({reviewCount} Reviews)</span>
                        ) : null}
                    </span>
                    {hasOpenStatus ? (
                        <Badge variant="secondary" className="ml-auto">
                            {provider.isOpen ? 'Open' : 'Closed'}
                        </Badge>
                    ) : null}
                </div>
            </div>

            {summary ? (
                <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium text-foreground">Mendr Summary</p>
                    <p className="text-sm text-muted-foreground">{summary}</p>
                </div>
            ) : summaryLoading ? (
                <div
                    className="flex flex-col gap-2"
                    aria-busy="true"
                    aria-label="Loading Mendr summary"
                >
                    <p className="text-sm font-medium text-foreground">Mendr Summary</p>
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3.5 w-[92%]" />
                    <Skeleton className="h-3.5 w-[72%]" />
                </div>
            ) : null}

            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex-1">{contactSlot}</div>
                <Button
                    type="button"
                    variant="ghost"
                    className="h-10 flex-1"
                    onClick={(e) => {
                        e.stopPropagation();
                        onViewMore();
                    }}
                    disabled={!provider.providerId}
                >
                    View More
                </Button>
            </div>
        </div>
    );
}
