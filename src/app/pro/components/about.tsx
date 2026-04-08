import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProPageMap } from '@/app/pro/[id]/components/map';
import type { Dispatch, SetStateAction } from 'react';

function toTitleCaseLabel(text: string): string {
    const trimmed = text.trim().replace(/\s+/g, ' ');
    if (!trimmed) return '';
    const upperTokens = new Set(['ac', 'cctv', 'tv', 'hvac', 'gps', 'wifi', 'dc', 'db']);
    return trimmed
        .split(' ')
        .map((word) => {
            const clean = word.toLowerCase();
            if (upperTokens.has(clean)) return clean.toUpperCase();
            return clean.charAt(0).toUpperCase() + clean.slice(1);
        })
        .join(' ');
}

function HoursRow({ day, hours, today }: { day: string; hours?: string; today?: boolean }) {
    return (
        <div className="flex flex-row justify-between items-center py-1.5 border-b border-border/50 last:border-0">
            <p className={`text-sm ${today ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                {day}
            </p>
            <p className={`text-sm tabular-nums ${today ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                {hours || '—'}
            </p>
        </div>
    );
}

export function ProAboutTab(props: {
    operatingHoursByDay: Record<string, string>;
    isOperatingHoursLoading: boolean;
    showAllOperatingHours: boolean;
    setShowAllOperatingHours: Dispatch<SetStateAction<boolean>>;
    hasMapCoords: boolean;
    mapsApiKey: string;
    providerName: string | null;
    providerAddress: string | null;
    providerLat: number | null;
    providerLng: number | null;
    mapEmbedSrc: string | null;
    addressDisplayLine: string | null;
    directionsHref: string | null;
    profileSummaryLong: string | null;
    specialisations?: string[];
    highlights?: string[];
}) {
    const {
        operatingHoursByDay,
        isOperatingHoursLoading,
        showAllOperatingHours,
        setShowAllOperatingHours,
        hasMapCoords,
        mapsApiKey,
        providerName,
        providerAddress,
        providerLat,
        providerLng,
        mapEmbedSrc,
        addressDisplayLine,
        directionsHref,
        profileSummaryLong,
        specialisations = [],
        highlights = [],
    } = props;

    const dayOrderSunFirst = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date();
    const todayDay = dayOrderSunFirst[today.getDay()];
    const tomorrowDay = dayOrderSunFirst[(today.getDay() + 1) % 7];
    const tomorrowIndexSunFirst = dayOrderSunFirst.indexOf(tomorrowDay);
    const restDaysChrono = Array.from({ length: 5 }, (_, i) =>
        dayOrderSunFirst[(tomorrowIndexSunFirst + 1 + i) % 7]
    ).filter((d) => Boolean(operatingHoursByDay[d]));
    const hasRestDays = restDaysChrono.length > 0;

    return (
        <div className="flex flex-col gap-8 mt-2">

            {/* ── About ── */}
            {isOperatingHoursLoading ? (
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-11/12" />
                    <Skeleton className="h-4 w-4/5" />
                </div>
            ) : profileSummaryLong?.trim() ? (
                <div className="flex flex-col gap-2">
                    <h3 className="text-base font-semibold text-foreground">About</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {profileSummaryLong.trim()}
                    </p>
                </div>
            ) : null}

            {/* ── Services ── */}
            {specialisations.length > 0 && (
                <div className="flex flex-col gap-3">
                    <h3 className="text-base font-semibold text-foreground">Services</h3>
                    <div className="flex flex-wrap gap-2">
                        {specialisations.map((s) => (
                            <Badge key={s} variant="secondary" className="font-normal">
                                {toTitleCaseLabel(s)}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Highlights ── */}
            {highlights.length > 0 && (
                <div className="flex flex-col gap-3">
                    <h3 className="text-base font-semibold text-foreground">Highlights</h3>
                    <ul className="flex flex-col gap-2.5">
                        {highlights.slice(0, 8).map((h, i) => (
                            <li key={i} className="flex gap-2.5 text-sm text-muted-foreground leading-relaxed">
                                <span className="mt-[5px] size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                                <span>{h.trim()}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* ── Hours ── */}
            <div className="flex flex-col gap-3">
                <h3 className="text-base font-semibold text-foreground">Hours</h3>
                {isOperatingHoursLoading ? (
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-4 w-44" />
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col">
                            <HoursRow day={todayDay} hours={operatingHoursByDay[todayDay]} today />
                            <HoursRow day={tomorrowDay} hours={operatingHoursByDay[tomorrowDay]} />
                            {showAllOperatingHours &&
                                restDaysChrono.map((d) => (
                                    <HoursRow key={d} day={d} hours={operatingHoursByDay[d]} />
                                ))}
                        </div>
                        {hasRestDays && (
                            <button
                                type="button"
                                className="w-fit text-xs text-muted-foreground underline-offset-2 hover:underline"
                                onClick={() => setShowAllOperatingHours((v) => !v)}
                            >
                                {showAllOperatingHours ? 'Show less' : 'Show all hours'}
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* ── Location ── */}
            <div className="flex flex-col gap-3">
                <h3 className="text-base font-semibold text-foreground">Location</h3>
                {isOperatingHoursLoading ? (
                    <Skeleton className="h-48 w-full rounded-xl" />
                ) : hasMapCoords && mapsApiKey && providerLat != null && providerLng != null ? (
                    <ProPageMap
                        apiKey={mapsApiKey}
                        provider={{
                            name: providerName || 'Provider',
                            address: providerAddress ?? undefined,
                            latitude: providerLat,
                            longitude: providerLng,
                        }}
                    />
                ) : mapEmbedSrc ? (
                    <div className="relative w-full overflow-hidden rounded-xl border border-border bg-card">
                        <div className="h-48 w-full">
                            <iframe
                                title="Provider location"
                                src={mapEmbedSrc}
                                className="block h-full w-full border-0"
                                loading="lazy"
                                allowFullScreen
                                referrerPolicy="no-referrer-when-downgrade"
                            />
                        </div>
                    </div>
                ) : null}
                {!isOperatingHoursLoading && (addressDisplayLine || directionsHref) && (
                    <div className="flex flex-row items-center justify-between gap-3">
                        {addressDisplayLine && (
                            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                                {addressDisplayLine}
                            </p>
                        )}
                        {directionsHref && (
                            <Button variant="secondary" className="h-10 shrink-0" asChild>
                                <a href={directionsHref} target="_blank" rel="noopener noreferrer">
                                    Get Directions
                                </a>
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
