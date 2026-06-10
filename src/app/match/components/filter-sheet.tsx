'use client';

/**
 * Full-screen sort & filter overlay for /match.
 *
 * Pattern intentionally mirrors Airbnb's filter sheet:
 *  - Top bar: close (X) + title; the title doubles as the active-filter count.
 *  - Scrollable body: each filter group has a label + brief helper copy + control.
 *  - Sticky footer: "Clear all" (left) + "Show N results" (right) — the count is live.
 *
 * The sheet is intentionally controlled — the parent owns `state` (via `useMatchFilters`) and a
 * "draft" copy is kept locally so the user can experiment without mutating URL state until they
 * either apply or close. On apply we propagate, on cancel/close we discard.
 *
 * NOTE: We render the overlay via React Portal so it can fully cover the floating sheet/map
 * regardless of stacking context.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BRAND_NAME } from '@/lib/brand-system';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { MatchProvider } from '@/features/match/contracts';
import {
    applyFilters,
    countActiveFilters,
    DEFAULT_FILTER_STATE,
    SORT_OPTIONS,
    type MatchFilterState,
    type MatchSortKey,
} from '@/features/match/hooks/use-match-filters';
import { DistanceHistogram } from '@/app/match/components/distance-histogram';

const COMPANY_SIZE_LABELS: Record<NonNullable<MatchProvider['companySize']>, string> = {
    solo: 'Solo (1)',
    small: 'Small (2–5)',
    mid: 'Mid (6–20)',
    large: 'Large (20+)',
};

export type FilterSheetProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    state: MatchFilterState;
    onApply: (next: MatchFilterState) => void;
    /** Provider superset used to compute the histogram and the live "Show N results" count. */
    providers: ReadonlyArray<MatchProvider>;
    /** Maximum value for distance slider (km). Defaults to 50. */
    maxDistanceKm?: number;
};

export function FilterSheet({
    open,
    onOpenChange,
    state,
    onApply,
    providers,
    maxDistanceKm = 50,
}: FilterSheetProps) {
    const [draft, setDraft] = useState<MatchFilterState>(state);
    /** Reset draft whenever the sheet opens fresh; closing without apply preserves committed state. */
    useEffect(() => {
        if (open) setDraft(state);
    }, [open, state]);

    /** Lock body scroll while open. */
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    /**
     * Swap the header label between the brand name and "Filters" depending on
     * whether the in-body title has scrolled out of view — same behaviour as the
     * History page. Re-attaches each time the sheet opens (the title only exists then).
     */
    const headingRef = useRef<HTMLHeadingElement>(null);
    const [headingVisible, setHeadingVisible] = useState(true);
    useEffect(() => {
        if (!open) return;
        const el = headingRef.current;
        if (!el || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(
            ([entry]) => setHeadingVisible(entry?.isIntersecting ?? true),
            { threshold: 0 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [open]);

    const draftActive = useMemo(() => countActiveFilters(draft), [draft]);
    const distancesKm = useMemo(() => providers.map((p) => p.distanceKm), [providers]);
    const liveResultCount = useMemo(
        () => applyFilters(providers, draft).length,
        [providers, draft]
    );

    const setDraftField = <K extends keyof MatchFilterState>(key: K, value: MatchFilterState[K]) => {
        setDraft((prev) => ({ ...prev, [key]: value }));
    };

    if (!open) return null;
    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[300] flex flex-col bg-background">
            {/* Header — same as the match page header, with "Filters" centered and a Reset button. */}
            <div className="sticky top-0 z-10 shrink-0 bg-background">
                <div className="relative flex h-16 items-center justify-between gap-3 px-4">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onOpenChange(false)}
                        aria-label="Close filters"
                    >
                        <ArrowLeft strokeWidth={2.5} />
                    </Button>
                    <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base font-medium text-foreground">
                        {headingVisible ? BRAND_NAME : 'Filters'}
                    </p>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDraft(DEFAULT_FILTER_STATE)}
                        disabled={draftActive === 0}
                    >
                        Reset
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
                    <div className="flex w-full flex-col gap-3">
                        <h1 ref={headingRef} className="text-2xl font-semibold text-foreground">
                            Filters
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
                            eiusmod tempor incididunt ut labore et dolore.
                        </p>
                    </div>

                    <SortSection
                        value={draft.sort}
                        onChange={(value) => setDraftField('sort', value)}
                    />

                    <Section title="Distance" subtitle="Lorem ipsum dolor sit amet, consectetur adipiscing elit.">
                        <DistanceHistogram
                            distancesKm={distancesKm}
                            maxKm={maxDistanceKm}
                            minKm={draft.distanceMinKm}
                            selectedMaxKm={draft.distanceMaxKm}
                            onChange={({ minKm, maxKm }) => {
                                setDraft((prev) => ({
                                    ...prev,
                                    distanceMinKm: minKm,
                                    distanceMaxKm: maxKm,
                                }));
                            }}
                        />
                    </Section>

                    <Section title="Quick Toggles" subtitle="Lorem ipsum dolor sit amet, consectetur adipiscing elit.">
                        <div className="flex flex-col divide-y divide-border">
                            <ToggleRow
                                label="Open Now"
                                checked={draft.onlyOpenNow}
                                onCheckedChange={(v) => setDraftField('onlyOpenNow', v)}
                            />
                            <ToggleRow
                                label="Has Website"
                                checked={draft.hasWebsite}
                                onCheckedChange={(v) => setDraftField('hasWebsite', v)}
                            />
                            <ToggleRow
                                label="Has Work Photos"
                                checked={draft.hasWorkPhotos}
                                onCheckedChange={(v) => setDraftField('hasWorkPhotos', v)}
                            />
                        </div>
                    </Section>

                </div>
            </div>

            <div className="sticky bottom-0 shrink-0 bg-background p-4">
                <div className="mx-auto flex w-full max-w-xl flex-col gap-2">
                    <Button type="button" className="w-full" onClick={() => onApply(draft)}>
                        {liveResultCount > 0
                            ? `Show ${liveResultCount} Result${liveResultCount === 1 ? '' : 's'}`
                            : 'No Matches — Adjust Filters'}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        onClick={() => setDraft(DEFAULT_FILTER_STATE)}
                        disabled={draftActive === 0}
                    >
                        Clear All
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function Section({
    title,
    subtitle,
    children,
}: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}) {
    return (
        <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-foreground">{title}</h2>
                {subtitle ? (
                    <p className="text-sm text-muted-foreground">{subtitle}</p>
                ) : null}
            </div>
            {children}
        </section>
    );
}

function ToggleRow({
    label,
    checked,
    onCheckedChange,
}: {
    label: string;
    checked: boolean;
    onCheckedChange: (next: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
            </div>
            <Switch checked={checked} onCheckedChange={onCheckedChange} />
        </div>
    );
}

function SortSection({
    value,
    onChange,
}: {
    value: MatchSortKey;
    onChange: (next: MatchSortKey) => void;
}) {
    return (
        <Section title="Sort By" subtitle="Lorem ipsum dolor sit amet, consectetur adipiscing elit.">
            <RadioGroup
                value={value}
                onValueChange={(next) => onChange(next as MatchSortKey)}
                className="flex flex-col gap-0 divide-y divide-border"
            >
                {SORT_OPTIONS.map((opt) => (
                    <Label
                        key={opt.value}
                        htmlFor={`sort-${opt.value}`}
                        className="flex w-full cursor-pointer items-center justify-between gap-3 py-3"
                    >
                        {opt.label}
                        <RadioGroupItem id={`sort-${opt.value}`} value={opt.value} />
                    </Label>
                ))}
            </RadioGroup>
        </Section>
    );
}

