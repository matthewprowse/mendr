'use client';

/**
 * Distance filter for /match.
 *
 * A shadcn/recharts bar chart of provider density per distance band — hover a
 * bar to see how many providers fall within that band — plus a dual-handle range
 * slider and exact Minimum/Maximum km inputs. Bars inside the selected min/max
 * range render at full opacity; out-of-range bars dim.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Bar, BarChart, Cell } from 'recharts';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from '@/components/ui/chart';

const BUCKET_COUNT = 12;

const chartConfig = {
    providers: { label: 'Providers', color: 'var(--primary)' },
} satisfies ChartConfig;

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
        return counts.map((c, idx) => ({
            idx,
            count: c,
            start: idx * stride,
            end: (idx + 1) * stride,
        }));
    }, [distancesKm, maxKm]);

    const safeMin = Math.max(0, Math.min(minKm, selectedMaxKm));
    const safeMax = Math.max(safeMin, Math.min(selectedMaxKm, maxKm));

    const chartData = buckets.map((b) => ({
        bucket: `${Math.round(b.start)}`,
        range: `${Math.round(b.start)}–${Math.round(b.end)} km`,
        providers: b.count,
        inRange: b.end > safeMin && b.start < safeMax,
    }));

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
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
                <ChartContainer config={chartConfig} className="aspect-auto h-32 w-full">
                    <BarChart
                        data={chartData}
                        margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
                        barCategoryGap={2}
                    >
                        <ChartTooltip
                            cursor={false}
                            content={
                                <ChartTooltipContent
                                    hideIndicator
                                    labelFormatter={(_label, items) =>
                                        items?.[0]?.payload?.range ?? ''
                                    }
                                />
                            }
                        />
                        <Bar dataKey="providers" radius={4} isAnimationActive={false}>
                            {chartData.map((entry, i) => (
                                <Cell
                                    key={i}
                                    fill="var(--color-providers)"
                                    fillOpacity={entry.inRange ? 1 : 0.25}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ChartContainer>

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
            </div>

            <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-3">
                    <Label htmlFor="distance-min">Minimum</Label>
                    <div className="flex items-center gap-1 rounded-md border border-input px-2 py-1">
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
                <div className="flex flex-1 flex-col gap-3">
                    <Label htmlFor="distance-max">Maximum</Label>
                    <div className="flex items-center gap-1 rounded-md border border-input px-2 py-1">
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
