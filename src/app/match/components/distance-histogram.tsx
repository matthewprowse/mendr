'use client';

/**
 * Airbnb-style distance picker for /match filters.
 *
 *  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  ← bar per bucket
 *  │ ▒▒▒▒▒    │ │ ▓▓▓▓▓▓▓▓ │ │ ▓▓▓▓▓▓▓▓ │ │ ▓▓▓▓     │ │ ▒▒       │     (live count)
 *  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
 *  ╞════════════●═══════════════════════════●═════════════════════════╡   range slider
 *  Min  [ 0  ] km                                              Max [ 50 ] km
 *
 * The histogram visualizes the live distribution of providers across distance buckets so users can
 * eyeball "where the supply is". Bars within the active min/max range are highlighted; out-of-range
 * bars dim. The slider drives `state.distanceMin/MaxKm`; numeric inputs allow exact entry. When `min`
 * crosses the 25/50 km threshold we hint upstream that the search radius might need to grow — the
 * caller decides whether to widen `searchRadiusMeters`.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const BUCKET_COUNT = 12;
const BUCKET_MIN_HEIGHT_PX = 4;
const BUCKET_MAX_HEIGHT_PX = 64;

export type DistanceHistogramProps = {
    /** Distances of all providers (km). null/undefined entries are ignored. */
    distancesKm: ReadonlyArray<number | null | undefined>;
    /** Maximum distance the slider should cover (km). */
    maxKm: number;
    /** Currently selected min/max range. */
    minKm: number;
    selectedMaxKm: number;
    onChange: (next: { minKm: number; maxKm: number }) => void;
};

export function DistanceHistogram({
    distancesKm,
    maxKm,
    minKm,
    selectedMaxKm,
    onChange,
}: DistanceHistogramProps) {
    const buckets = useMemo(() => {
        const safeMax = Math.max(1, maxKm);
        const counts = new Array<number>(BUCKET_COUNT).fill(0);
        const stride = safeMax / BUCKET_COUNT;
        distancesKm.forEach((d) => {
            if (typeof d !== 'number' || !Number.isFinite(d)) return;
            const clamped = Math.max(0, Math.min(safeMax - 0.0001, d));
            const idx = Math.min(BUCKET_COUNT - 1, Math.floor(clamped / stride));
            counts[idx] += 1;
        });
        const peak = Math.max(1, ...counts);
        return counts.map((c, idx) => {
            const heightPx =
                BUCKET_MIN_HEIGHT_PX +
                (BUCKET_MAX_HEIGHT_PX - BUCKET_MIN_HEIGHT_PX) * (c / peak);
            const start = idx * stride;
            const end = (idx + 1) * stride;
            return { idx, count: c, heightPx, start, end };
        });
    }, [distancesKm, maxKm]);

    const safeMin = Math.max(0, Math.min(minKm, selectedMaxKm));
    const safeMax = Math.max(safeMin, Math.min(selectedMaxKm, maxKm));

    /**
     * Track the slider as a controlled tuple. We mirror the parent state into local state so users
     * can drag without triggering URL writes on every keystroke; we flush on commit.
     */
    const [draft, setDraft] = useState<[number, number]>([safeMin, safeMax]);
    useEffect(() => {
        setDraft([safeMin, safeMax]);
    }, [safeMin, safeMax]);

    const lastEmittedRef = useRef<[number, number]>([safeMin, safeMax]);
    const flush = (next: [number, number]) => {
        const [a, b] = next;
        const min = Math.max(0, Math.min(a, b));
        const max = Math.max(min, Math.min(b, maxKm));
        const last = lastEmittedRef.current;
        if (last[0] === min && last[1] === max) return;
        lastEmittedRef.current = [min, max];
        onChange({ minKm: min, maxKm: max });
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-end gap-1 px-1" aria-hidden="true">
                {buckets.map((bucket) => {
                    const inRange = bucket.end > safeMin && bucket.start < safeMax;
                    return (
                        <div
                            key={bucket.idx}
                            title={`${Math.round(bucket.start)}–${Math.round(bucket.end)} km · ${bucket.count} provider${bucket.count === 1 ? '' : 's'}`}
                            className={cn(
                                'flex-1 rounded-t-sm transition-colors',
                                inRange ? 'bg-foreground/80' : 'bg-foreground/15'
                            )}
                            style={{ height: `${bucket.heightPx}px` }}
                        />
                    );
                })}
            </div>

            <SliderPrimitive.Root
                min={0}
                max={Math.max(1, maxKm)}
                step={1}
                minStepsBetweenThumbs={1}
                value={draft}
                onValueChange={(next) => {
                    if (next.length !== 2) return;
                    setDraft([next[0]!, next[1]!]);
                }}
                onValueCommit={(next) => {
                    if (next.length !== 2) return;
                    flush([next[0]!, next[1]!]);
                }}
                className="relative flex w-full touch-none select-none items-center"
            >
                <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary">
                    <SliderPrimitive.Range className="absolute h-full bg-foreground" />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb
                    aria-label="Minimum distance"
                    className="block size-5 rounded-full border-2 border-foreground bg-background shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
                />
                <SliderPrimitive.Thumb
                    aria-label="Maximum distance"
                    className="block size-5 rounded-full border-2 border-foreground bg-background shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
                />
            </SliderPrimitive.Root>

            <div className="flex items-end gap-3">
                <div className="flex-1">
                    <Label htmlFor="distance-min" className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Minimum
                    </Label>
                    <div className="mt-1 flex items-center gap-1 rounded-md border border-input px-2 py-1">
                        <Input
                            id="distance-min"
                            type="number"
                            min={0}
                            max={maxKm}
                            value={String(draft[0])}
                            onChange={(e) => {
                                const n = Number(e.target.value);
                                if (!Number.isFinite(n)) return;
                                const next: [number, number] = [
                                    Math.max(0, Math.min(maxKm, n)),
                                    draft[1],
                                ];
                                setDraft(next);
                            }}
                            onBlur={() => flush(draft)}
                            className="h-7 border-0 px-1 py-0 text-sm shadow-none focus-visible:ring-0"
                        />
                        <span className="text-xs text-muted-foreground">km</span>
                    </div>
                </div>
                <div className="flex-1">
                    <Label htmlFor="distance-max" className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Maximum
                    </Label>
                    <div className="mt-1 flex items-center gap-1 rounded-md border border-input px-2 py-1">
                        <Input
                            id="distance-max"
                            type="number"
                            min={0}
                            max={maxKm}
                            value={String(draft[1])}
                            onChange={(e) => {
                                const n = Number(e.target.value);
                                if (!Number.isFinite(n)) return;
                                const next: [number, number] = [
                                    draft[0],
                                    Math.max(0, Math.min(maxKm, n)),
                                ];
                                setDraft(next);
                            }}
                            onBlur={() => flush(draft)}
                            className="h-7 border-0 px-1 py-0 text-sm shadow-none focus-visible:ring-0"
                        />
                        <span className="text-xs text-muted-foreground">km</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
