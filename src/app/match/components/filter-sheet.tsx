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

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowsClockwise, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
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
    /** Specialisations available across loaded providers (deduped, alphabetical). */
    availableSpecialisations: readonly string[];
    /** Maximum value for distance slider (km). Defaults to 50. */
    maxDistanceKm?: number;
};

export function FilterSheet({
    open,
    onOpenChange,
    state,
    onApply,
    providers,
    availableSpecialisations,
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
            <header className="flex h-14 shrink-0 items-center justify-between gap-3 bg-background px-6">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    onClick={() => onOpenChange(false)}
                    aria-label="Close filters"
                >
                    <X size={18} weight="bold" />
                </Button>
                <h2 className="text-base font-semibold">
                    Filters{draftActive > 0 ? ` · ${draftActive}` : ''}
                </h2>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-sm"
                    onClick={() => setDraft(DEFAULT_FILTER_STATE)}
                    disabled={draftActive === 0}
                >
                    <ArrowsClockwise size={14} weight="bold" />
                    Reset
                </Button>
            </header>

            <div className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
                    <SortSection
                        value={draft.sort}
                        onChange={(value) => setDraftField('sort', value)}
                    />

                    <Section title="Distance" subtitle="Alarm Ipsum">
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

                    <Section title="Rating Range" subtitle="Alarm Ipsum">
                        <RatingRangePicker
                            minValue={draft.minRating}
                            maxValue={draft.maxRating}
                            onChange={({ minValue, maxValue }) => {
                                setDraft((prev) => ({
                                    ...prev,
                                    minRating: minValue,
                                    maxRating: maxValue,
                                }));
                            }}
                        />
                    </Section>

                    <Section title="Quick Toggles" subtitle="Alarm Ipsum">
                        <div className="flex flex-col divide-y divide-border">
                            <ToggleRow
                                label="Open Now"
                                checked={draft.onlyOpenNow}
                                onCheckedChange={(v) => setDraftField('onlyOpenNow', v)}
                            />
                            <ToggleRow
                                label="Open 24/7"
                                checked={draft.is247}
                                onCheckedChange={(v) => setDraftField('is247', v)}
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

                    {/* Company Size filter hidden — company_size not yet in DB schema */}

                    {availableSpecialisations.length > 0 ? (
                        <Section title="Specialisations" subtitle="Alarm Ipsum">
                            <ChipGroup
                                options={availableSpecialisations.map((s) => ({ value: s, label: s }))}
                                selectedValues={draft.specialisations}
                                onChange={(next) => setDraftField('specialisations', next)}
                                multi
                            />
                        </Section>
                    ) : null}

                    <Section title="Certifications" subtitle="Alarm Ipsum">
                        <ChipGroup
                            options={[
                                { value: 'yes', label: 'Yes, They Have' },
                                { value: 'no', label: "No, They Don't" },
                            ]}
                            selectedValues={
                                draft.certifications === 'any' ? [] : [draft.certifications]
                            }
                            onChange={(next) => {
                                if (!next.length) {
                                    setDraftField('certifications', 'any');
                                    return;
                                }
                                const value = next[0] === 'yes' ? 'yes' : 'no';
                                setDraftField('certifications', value);
                            }}
                            multi={false}
                        />
                    </Section>
                </div>
            </div>

            <footer className="sticky bottom-0 shrink-0 bg-background px-6 py-3">
                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        className="flex-1"
                        onClick={() => setDraft(DEFAULT_FILTER_STATE)}
                        disabled={draftActive === 0}
                    >
                        Clear All
                    </Button>
                    <Button
                        type="button"
                        onClick={() => onApply(draft)}
                        className="flex-1"
                    >
                        {liveResultCount > 0
                            ? `Show ${liveResultCount} Result${liveResultCount === 1 ? '' : 's'}`
                            : 'No Matches — Adjust Filters'}
                    </Button>
                </div>
            </footer>
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
        <section className="flex flex-col gap-3">
            <header className="flex flex-col gap-0.5">
                <h3 className="text-sm font-semibold">{title}</h3>
                {subtitle ? (
                    <p className="text-xs text-muted-foreground">{subtitle}</p>
                ) : null}
            </header>
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
        <Section title="Sort by">
            <div className="flex flex-wrap gap-2">
                {SORT_OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        className={cn(
                            'rounded-full border px-3 py-1.5 text-sm transition-colors',
                            value === opt.value
                                ? 'border-foreground bg-foreground text-background'
                                : 'border-border bg-background text-foreground hover:bg-secondary'
                        )}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </Section>
    );
}

function RatingRangePicker({
    minValue,
    maxValue,
    onChange,
}: {
    minValue: number;
    maxValue: number;
    onChange: (next: { minValue: number; maxValue: number }) => void;
}) {
    const options: Array<{ label: string; v: number }> = [
        { label: 'Any', v: 0 },
        { label: '3.0+', v: 3 },
        { label: '3.5+', v: 3.5 },
        { label: '4.0+', v: 4 },
        { label: '4.5+', v: 4.5 },
    ];
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
                <span className="w-full text-xs font-medium text-muted-foreground">Minimum</span>
                {options.map((opt) => (
                    <button
                        key={`min-${opt.v}`}
                        type="button"
                        onClick={() => onChange({ minValue: opt.v, maxValue })}
                        className={cn(
                            'rounded-full border px-3 py-1.5 text-sm transition-colors',
                            Math.abs(minValue - opt.v) < 0.0001
                                ? 'border-foreground bg-foreground text-background'
                                : 'border-border bg-background text-foreground hover:bg-secondary'
                        )}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
            <div className="flex flex-wrap gap-2">
                <span className="w-full text-xs font-medium text-muted-foreground">Maximum</span>
                {options.map((opt) => (
                    <button
                        key={`max-${opt.v}`}
                        type="button"
                        onClick={() => onChange({ minValue, maxValue: opt.v })}
                        className={cn(
                            'rounded-full border px-3 py-1.5 text-sm transition-colors',
                            Math.abs(maxValue - opt.v) < 0.0001
                                ? 'border-foreground bg-foreground text-background'
                                : 'border-border bg-background text-foreground hover:bg-secondary'
                        )}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ChipGroup({
    options,
    selectedValues,
    onChange,
    multi = true,
}: {
    options: ReadonlyArray<{ value: string; label: string; title?: string }>;
    selectedValues: readonly string[];
    onChange: (next: string[]) => void;
    multi?: boolean;
}) {
    const set = new Set(selectedValues);
    return (
        <div className="flex flex-wrap gap-2">
            {options.map((opt) => {
                const active = set.has(opt.value);
                return (
                    <button
                        key={opt.value}
                        type="button"
                        title={opt.title || opt.label}
                        onClick={() => {
                            if (!multi) {
                                onChange(active ? [] : [opt.value]);
                                return;
                            }
                            const next = new Set(set);
                            if (active) next.delete(opt.value);
                            else next.add(opt.value);
                            onChange(Array.from(next));
                        }}
                        className={cn(
                            'rounded-full border px-3 py-1.5 text-sm transition-colors',
                            active
                                ? 'border-foreground bg-foreground text-background'
                                : 'border-border bg-background text-foreground hover:bg-secondary'
                        )}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
