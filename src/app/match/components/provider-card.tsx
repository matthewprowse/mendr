'use client';

/**
 * Match provider card (post-redesign):
 *  - Airbnb-style top banner image carousel (paginated dots, swipe-friendly).
 *  - Header row: name + "verified on Mendr" shield when `provider.providerId` is set.
 *  - Stats row: rating (filled star + N reviews), distance, drive time, open/closed pill.
 *  - Chip row: certifications + specialisations (truncated to 4 visible + "+N").
 *  - Clamped summary (3 lines) — defers to skeleton/long-wait copy supplied by parent.
 *  - Address row.
 *  - Bottom CTAs: "View Profile" (passes through to existing handler) + "Contact Contractor"
 *    popover (passed in as a slot so existing WhatsApp/phone/email tracking is preserved).
 *
 * Tapping the card body (anywhere outside the CTAs) navigates to `/contractors/[id]` —
 * matches Airbnb's "tap-card-to-open" pattern. CTAs `event.stopPropagation()` to keep
 * the existing inline actions snappy.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    Car,
    Image,
    MapPin,
    ShieldCheck,
    Star,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SaveProviderButton } from '@/components/save-provider-button';
import { cn, formatBusinessName } from '@/lib/utils';
import { mendrTokens } from '@/lib/design-tokens';
import type { MatchProvider } from '@/features/match/contracts';
import { getOpenStatusTextFromWeekdayDescriptions } from '@/lib/providers/open-status';

const VISIBLE_CHIP_LIMIT = 4;
const SUPABASE_PUBLIC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

function normalizeCardImageUrl(raw: string): string {
    const value = raw.trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value) || value.startsWith('data:image/') || value.startsWith('blob:')) {
        return value;
    }
    if (value.startsWith('/')) return value;
    if (SUPABASE_PUBLIC_URL) {
        const base = SUPABASE_PUBLIC_URL.replace(/\/+$/, '');
        return `${base}/storage/v1/object/public/gallery/${value.replace(/^\/+/, '')}`;
    }
    return value;
}

function formatProviderAddress(raw: string | null | undefined): string {
    const s = (raw ?? '').trim();
    if (!s) return '';
    const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return '';
    const COUNTRY_RE = /(south africa)/i;
    const POSTCODE_RE = /^\d{3,6}$/;
    while (parts.length > 0) {
        const last = parts[parts.length - 1] ?? '';
        if (COUNTRY_RE.test(last) || POSTCODE_RE.test(last)) {
            parts.pop();
            continue;
        }
        break;
    }
    return parts.join(', ');
}

function formatDuration(text: string): string {
    return text.replace(/\bmins?\b/gi, 'Minutes').replace(/\bhrs?\b/gi, 'Hours');
}

function formatDistanceKm(km: number | null | undefined): string | null {
    if (typeof km !== 'number' || !Number.isFinite(km)) return null;
    if (km < 1) return `${Math.round(km * 10) / 10} km`;
    if (km < 10) return `${km.toFixed(1)} km`;
    return `${Math.round(km)} km`;
}

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

function ImagePlaceholder({ providerName }: { providerName: string }) {
    return (
        <div className="flex aspect-[16/10] w-full items-center justify-center rounded-lg bg-gradient-to-br from-muted to-secondary text-muted-foreground">
            <div className="flex flex-col items-center gap-1">
                <Image size={28} aria-hidden="true" />
                <p className="text-xs font-medium uppercase tracking-wide">No photos yet</p>
                <p className="sr-only">{providerName}</p>
            </div>
        </div>
    );
}

export type ProviderCardProps = {
    provider: MatchProvider;
    isSelected: boolean;
    reviewCount: number;
    summary: string | null;
    summaryLoading: boolean;
    longWaitSummaryFallback: boolean;
    /** Renders the provider's certification chips returned from the contracts layer. */
    certifications?: NonNullable<MatchProvider['certifications']>;
    onSelect: () => void;
    onOpenProfile: () => void;
    onImageSwipe?: (toIndex: number) => void;
    /** Slot for the existing Contact popover (kept as a prop so we don't rewrite WhatsApp tracking). */
    contactSlot: ReactNode;
    cardRef?: (node: HTMLDivElement | null) => void;
};

export function ProviderCard({
    provider,
    isSelected,
    reviewCount,
    summary,
    summaryLoading,
    longWaitSummaryFallback,
    certifications,
    onSelect,
    onOpenProfile,
    onImageSwipe,
    contactSlot,
    cardRef,
}: ProviderCardProps) {
    const distanceLabel = formatDistanceKm(provider.distanceKm);
    const driveLabel = provider.durationText ? formatDuration(provider.durationText) : null;
    const hasOpenStatus = typeof provider.isOpen === 'boolean';

    const openHoursText = useMemo(() => {
        if (!provider.weekdayDescriptions || typeof provider.isOpen !== 'boolean') return null;
        if (provider.isOpen) {
            const now = new Date();
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const todayName = days[now.getDay()];
            const todayLine = (provider.weekdayDescriptions as unknown[]).find(
                (l): l is string => typeof l === 'string' && l.toLowerCase().startsWith(todayName.toLowerCase())
            );
            if (!todayLine) return null;
            if (/open\s*24\s*hours/i.test(todayLine)) return '24 hrs';
            const rangeMatch = todayLine.match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/);
            return rangeMatch ? `until ${rangeMatch[2]}` : null;
        } else {
            const result = getOpenStatusTextFromWeekdayDescriptions(provider.weekdayDescriptions, new Date());
            return result.nextOpensAt ? `opens ${result.nextOpensAt}` : null;
        }
    }, [provider.weekdayDescriptions, provider.isOpen]);
    const carouselImages = useMemo(() => {
        const raw = Array.isArray(provider.images) ? provider.images : [];
        return raw
            .map((img) => {
                const url =
                    typeof (img as any)?.url === 'string'
                        ? normalizeCardImageUrl((img as any).url)
                        : typeof img === 'string'
                          ? normalizeCardImageUrl(img)
                          : '';
                if (!url) return null;
                const caption = typeof (img as any)?.caption === 'string' ? (img as any).caption.trim() : undefined;
                return caption ? { url, caption } : { url };
            })
            .filter((img): img is { url: string; caption?: string } => Boolean(img));
    }, [provider.images]);
    const address = formatProviderAddress(provider.address);

    const chips = useMemo(() => {
        const certList = (certifications ?? []).map((c) => ({
            key: `cert:${c.slug}`,
            label: c.short || c.label,
        }));
        const certVisible = certList.slice(0, VISIBLE_CHIP_LIMIT);
        const certOverflow = Math.max(0, certList.length - certVisible.length);

        const toTitleCase = (s: string) =>
            s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
        const specList = (provider.specialisations ?? [])
            .filter(Boolean)
            .map((s) => ({ key: `spec:${s}`, label: toTitleCase(s) }));
        const specVisible = specList.slice(0, VISIBLE_CHIP_LIMIT);
        const specOverflow = Math.max(0, specList.length - specVisible.length);

        return { certVisible, certOverflow, specVisible, specOverflow };
    }, [certifications, provider.specialisations]);

    return (
        <div
            ref={cardRef}
            role="button"
            tabIndex={0}
            onClick={() => {
                onSelect();
                onOpenProfile();
            }}
            onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                onSelect();
                onOpenProfile();
            }}
            className={cn(
                'group flex w-full cursor-pointer flex-col gap-3 rounded-lg bg-card p-3 text-left transition-shadow',
                mendrTokens.shadow.card,
                'border border-border hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40',
                isSelected && 'ring-2 ring-foreground/70'
            )}
        >
            <div className="relative">
                {carouselImages.length > 0 ? (
                    <ProviderCardCarousel
                        images={carouselImages}
                        providerName={provider.name}
                        onImageSwipe={onImageSwipe}
                    />
                ) : (
                    <ImagePlaceholder providerName={provider.name} />
                )}
                <SaveProviderButton
                    providerId={provider.providerId ?? null}
                    className="absolute right-3 top-3 z-10"
                />
            </div>

            <div className="flex flex-col gap-3 px-2 pb-2 pt-1">
                <div className="flex items-start justify-between gap-3">
                    <h3 className="line-clamp-2 text-base font-semibold leading-tight text-foreground">
                        {formatBusinessName(provider.name)}
                    </h3>
                    {hasOpenStatus ? (
                        <div className="flex shrink-0 flex-col items-end gap-0.5">
                            <Badge
                                variant="secondary"
                                className={cn(
                                    'h-5 rounded-full px-2 text-xs font-medium',
                                    provider.isOpen
                                        ? 'border-green-200 bg-green-50 text-green-700'
                                        : 'border-red-200 bg-red-50 text-red-600'
                                )}
                            >
                                {provider.isOpen ? 'Open' : 'Closed'}
                            </Badge>
                            {openHoursText ? (
                                <span className="whitespace-nowrap text-xs text-muted-foreground">
                                    {openHoursText}
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-foreground">
                        <Star size={16} fill="currentColor" className="text-yellow-500" aria-hidden="true" />
                        {provider.rating != null ? provider.rating.toFixed(1) : 'New'}
                        {reviewCount > 0 ? (
                            <span className="font-normal text-muted-foreground">
                                ({reviewCount} reviews)
                            </span>
                        ) : null}
                    </span>
                </div>

                {chips.certVisible.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                        {chips.certVisible.map((chip) => (
                            <span
                                key={chip.key}
                                className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                            >
                                <ShieldCheck size={10} fill="currentColor" aria-hidden />
                                {chip.label}
                            </span>
                        ))}
                        {chips.certOverflow > 0 ? (
                            <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                +{chips.certOverflow}
                            </span>
                        ) : null}
                    </div>
                ) : null}

                {chips.specVisible.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                        {chips.specVisible.map((chip) => (
                            <span
                                key={chip.key}
                                className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground"
                            >
                                {chip.label}
                            </span>
                        ))}
                        {chips.specOverflow > 0 ? (
                            <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                +{chips.specOverflow}
                            </span>
                        ) : null}
                    </div>
                ) : null}

                {summary ? (
                    <p className="line-clamp-3 text-sm text-muted-foreground">{summary}</p>
                ) : summaryLoading ? (
                    <div
                        className="flex flex-col gap-2"
                        aria-busy="true"
                        aria-label="Loading review summary"
                    >
                        <Skeleton className="h-3.5 w-full" />
                        <Skeleton className="h-3.5 w-[92%]" />
                        <Skeleton className="h-3.5 w-[72%]" />
                    </div>
                ) : longWaitSummaryFallback ? (
                    <p className="text-sm text-muted-foreground">
                        Review summary is taking longer than usual — open the profile for full details.
                    </p>
                ) : null}

                {driveLabel ? (
                    <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Car size={14} aria-hidden="true" />
                        {driveLabel}
                    </div>
                ) : null}

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin size={14} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">
                        {[address, distanceLabel].filter(Boolean).join(' • ') || 'Distance unavailable'}
                    </span>
                </div>

                <div className="mt-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 flex-1"
                        onClick={(event) => {
                            event.stopPropagation();
                            onOpenProfile();
                        }}
                        disabled={!provider.providerId}
                    >
                        View Profile
                    </Button>
                    <div className="flex-1">{contactSlot}</div>
                </div>
            </div>
        </div>
    );
}
