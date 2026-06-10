'use client';

import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function parseWeekdayDescriptions(weekdayDescriptions: string[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const entry of weekdayDescriptions) {
        if (typeof entry !== 'string' || !entry.trim()) continue;
        const colonIdx = entry.indexOf(':');
        if (colonIdx <= 0) continue;
        const dayRaw = entry.slice(0, colonIdx).trim();
        const hours = entry.slice(colonIdx + 1).trim();
        if (!dayRaw || !hours) continue;
        const dayCanonical = canonicaliseDay(dayRaw);
        if (dayCanonical) map[dayCanonical] = hours;
    }
    return map;
}

function canonicaliseDay(input: string): string | null {
    const k = input.trim().toLowerCase();
    if (k.startsWith('sun')) return 'Sunday';
    if (k.startsWith('mon')) return 'Monday';
    if (k.startsWith('tue')) return 'Tuesday';
    if (k.startsWith('wed')) return 'Wednesday';
    if (k.startsWith('thu')) return 'Thursday';
    if (k.startsWith('fri')) return 'Friday';
    if (k.startsWith('sat')) return 'Saturday';
    return null;
}

export type HoursCardProps = {
    weekdayDescriptions: string[];
    isLoading: boolean;
    onExpand?: () => void;
};

export function HoursCard({ weekdayDescriptions, isLoading, onExpand }: HoursCardProps) {
    const [showAll, setShowAll] = useState(false);
    const map = parseWeekdayDescriptions(weekdayDescriptions);
    const today = new Date();
    const todayName = DAY_ORDER[today.getDay()];
    const tomorrowName = DAY_ORDER[(today.getDay() + 1) % 7];
    const restDays = DAY_ORDER.filter((d) => d !== todayName && d !== tomorrowName);
    const hasAnyHours = Object.keys(map).length > 0;

    const display = (day: string) => {
        const value = map[day];
        return value && value.trim() ? value : '—';
    };

    return (
        <section
            className="rounded-lg border border-border bg-card p-4"
            aria-labelledby="contractor-hours-heading"
        >
            <h2 id="contractor-hours-heading" className="mb-3 text-lg font-semibold text-foreground">
                Operating hours
            </h2>
            {isLoading ? (
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-44" />
                </div>
            ) : !hasAnyHours ? (
                <p className="text-sm text-muted-foreground">Hours unavailable.</p>
            ) : (
                <div className="flex flex-col">
                    <Row day={todayName} hours={display(todayName)} today />
                    <Row day={tomorrowName} hours={display(tomorrowName)} />
                    {showAll
                        ? restDays.map((d) => <Row key={d} day={d} hours={display(d)} />)
                        : null}
                    <button
                        type="button"
                        className="mt-2 self-start text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                        onClick={() => {
                            setShowAll((v) => {
                                const next = !v;
                                if (next) onExpand?.();
                                return next;
                            });
                        }}
                    >
                        {showAll ? 'Show less' : 'Show all hours'}
                    </button>
                </div>
            )}
        </section>
    );
}

function Row({ day, hours, today }: { day: string; hours: string; today?: boolean }) {
    return (
        <div className="flex items-center justify-between border-b border-border/50 py-1.5 last:border-0">
            <p className={`text-sm ${today ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                {day}
            </p>
            <p className={`text-sm tabular-nums ${today ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                {hours}
            </p>
        </div>
    );
}
