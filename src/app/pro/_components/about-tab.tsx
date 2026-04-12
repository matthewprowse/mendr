import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProPageMap } from '@/app/pro/[id]/_components/page-map';
import type { Dispatch, SetStateAction } from 'react';

function toSentence(text: string): string {
    const trimmed = text.trim().replace(/\s+/g, ' ');
    if (!trimmed) return '';
    const first = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    return /[.!?]$/.test(first) ? first : `${first}.`;
}

function toTwoSentences(text: string): string {
    const normalized = toSentence(text);
    if (!normalized) return '';
    const parts = normalized
        .split(/(?<=[.!?])\s+/)
        .map((part) => part.trim())
        .filter(Boolean);
    return parts.slice(0, 2).join(' ');
}

function toExpandedHighlight(text: string): string {
    const base = toTwoSentences(text);
    if (!base) return '';
    const wordCount = base.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 12) return base;
    return `${base} This helps homeowners choose with more confidence before booking.`;
}

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
    /** Long-form profile copy (website + reviews narrative). */
    profileSummaryLong: string | null;
    /** R11: Enrichment display fields */
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

    const hasEnrichment = profileSummaryLong?.trim() || specialisations.length > 0 || highlights.length > 0;
    const displayHighlights = highlights
        .map((item) => toExpandedHighlight(item))
        .filter(Boolean);

    return (
        <div className="flex flex-col gap-6 mt-2">

            {/* ── About ── */}
            <div className="flex flex-col gap-2">
                <h3 className="text-lg text-foreground font-bold">Summary</h3>
                {isOperatingHoursLoading ? (
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-11/12" />
                    </div>
                ) : profileSummaryLong?.trim() ? (
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                        {profileSummaryLong.trim()}
                    </p>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        We&apos;re still building this profile. Check back shortly for more about their services and past work.
                    </p>
                )}
            </div>

            {/* ── Highlights ── */}
            {displayHighlights.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-lg text-foreground font-bold">Highlights</h3>
                    <ul className="flex flex-col gap-2">
                        {displayHighlights.slice(0, 10).map((h, i) => (
                            <li key={`${h}-${i}`} className="ml-4 list-disc text-sm leading-relaxed text-foreground">
                                {h}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* ── Specialisations ── */}
            {specialisations.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-lg text-foreground font-bold">Specialisations</h3>
                    <div className="flex flex-wrap gap-2">
                        {specialisations.map((s) => (
                            <Badge key={s} variant="secondary">
                                {toTitleCaseLabel(s)}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            {/* ── No enrichment placeholder ── */}
            {!hasEnrichment && !isOperatingHoursLoading && (
                <div className="rounded-lg border border-dashed border-border p-4 text-center">
                    <p className="text-xs text-muted-foreground">
                        Profile details are being compiled. Check back shortly.
                    </p>
                </div>
            )}

            {/* ── Operating Hours ── */}
            <div className="flex flex-col gap-3">
                <h3 className="text-lg text-foreground font-bold">Operating Hours</h3>
                {(() => {
                    const dayOrderSunFirst = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const today = new Date();
                    const todayDay = dayOrderSunFirst[today.getDay()];
                    const tomorrowDay = dayOrderSunFirst[(today.getDay() + 1) % 7];
                    const tomorrowIndexSunFirst = dayOrderSunFirst.indexOf(tomorrowDay);
                    const restDaysAfterTomorrow = Array.from({ length: 5 }, (_, i) =>
                        dayOrderSunFirst[(tomorrowIndexSunFirst + 1 + i) % 7]
                    );
                    const hasGoogleOperatingHours = Object.keys(operatingHoursByDay).length > 0;
                    const restDaysChrono = hasGoogleOperatingHours
                        ? restDaysAfterTomorrow.filter((d) => Boolean(operatingHoursByDay[d]))
                        : restDaysAfterTomorrow;

                    const hasRest = restDaysChrono.length > 0;
                    const showRest = showAllOperatingHours && hasRest;
                    const hoursText = (day: string) => {
                        if (!hasGoogleOperatingHours) return 'Unknown';
                        return operatingHoursByDay[day]?.trim() || '—';
                    };
                    const todayHours = hoursText(todayDay);
                    const tomorrowHours = hoursText(tomorrowDay);

                    return (
                        <>
                            <div className="flex flex-row justify-between items-center">
                                <p className="text-sm text-foreground font-medium">{todayDay}</p>
                                {isOperatingHoursLoading ? (
                                    <Skeleton className="h-4 w-24" />
                                ) : (
                                    <p className="text-sm text-muted-foreground">{todayHours}</p>
                                )}
                            </div>
                            <div className="flex flex-row justify-between items-center">
                                <p className="text-sm text-foreground font-medium">{tomorrowDay}</p>
                                {isOperatingHoursLoading ? (
                                    <Skeleton className="h-4 w-24" />
                                ) : (
                                    <p className="text-sm text-muted-foreground">{tomorrowHours}</p>
                                )}
                            </div>

                            {showRest
                                ? restDaysChrono.map((d) => (
                                      <div key={d} className="flex flex-row justify-between items-center">
                                          <p className="text-sm text-foreground font-medium">{d}</p>
                                          {isOperatingHoursLoading ? (
                                              <Skeleton className="h-4 w-24" />
                                          ) : (
                                              <p className="text-sm text-muted-foreground">{hoursText(d)}</p>
                                          )}
                                      </div>
                                  ))
                                : null}

                            {hasRest ? (
                                <Button
                                    variant="secondary"
                                    className="h-10"
                                    onClick={() => setShowAllOperatingHours((v) => !v)}
                                >
                                    {showRest ? 'View Less' : 'View More'}
                                </Button>
                            ) : null}
                        </>
                    );
                })()}
            </div>

            {/* ── Directions ── */}
            <div className="flex flex-col gap-3">
                <h3 className="text-lg text-foreground font-bold">Directions</h3>
                {isOperatingHoursLoading ? (
                    <div className="relative w-full overflow-hidden rounded-xl border border-border bg-card">
                        <Skeleton className="h-48 w-full rounded-none" />
                    </div>
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
                ) : (
                    <div className="flex h-48 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40 px-4">
                        <p className="text-center text-sm text-muted-foreground">
                            Map unavailable — address will appear after this profile is synced from Google.
                        </p>
                    </div>
                )}
                <div className="flex flex-row items-center justify-between gap-3">
                    {isOperatingHoursLoading ? (
                        <>
                            <Skeleton className="h-4 w-2/3" />
                            <Skeleton className="h-10 w-32 rounded-md shrink-0" />
                        </>
                    ) : (
                        <>
                            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                                {addressDisplayLine || '—'}
                            </p>
                            {directionsHref ? (
                                <Button variant="secondary" className="h-10 shrink-0" asChild>
                                    <a href={directionsHref} target="_blank" rel="noopener noreferrer">
                                        Get Directions
                                    </a>
                                </Button>
                            ) : null}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
