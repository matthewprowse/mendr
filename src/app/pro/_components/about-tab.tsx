import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProPageMap } from '@/app/pro/[id]/_components/page-map';
import type { Dispatch, SetStateAction } from 'react';

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
    serviceAreas?: string[];
    certifications?: string[];
    highlights?: string[];
    honestNote?: string | null;
    yearsInBusiness?: number | null;
    founder?: string | null;
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
        serviceAreas = [],
        certifications = [],
        highlights = [],
        honestNote,
        yearsInBusiness,
        founder,
    } = props;

    const hasEnrichment = profileSummaryLong?.trim() || specialisations.length > 0 || highlights.length > 0;

    return (
        <div className="flex flex-col gap-6 mt-6">

            {/* ── About ── */}
            <div className="flex flex-col gap-2">
                <h3 className="text-lg text-foreground font-bold">About</h3>
                {profileSummaryLong?.trim() ? (
                    <>
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                            {profileSummaryLong.trim()}
                        </p>
                        {(yearsInBusiness != null || founder) && (
                            <div className="flex flex-wrap gap-2 mt-1">
                                {yearsInBusiness != null && (
                                    <span className="text-xs text-muted-foreground">
                                        {yearsInBusiness} year{yearsInBusiness !== 1 ? 's' : ''} in business
                                    </span>
                                )}
                                {founder && (
                                    <span className="text-xs text-muted-foreground">
                                        · Founded by {founder}
                                    </span>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        We&apos;re still building this profile. Check back shortly for more about their services and past work.
                    </p>
                )}
            </div>

            {/* ── Highlights ── */}
            {highlights.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-lg text-foreground font-bold">Highlights</h3>
                    <ul className="flex flex-col gap-1.5">
                        {highlights.map((h, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                                <span className="mt-0.5 shrink-0 text-primary">✓</span>
                                <span>{h}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* ── Services & Specialisations ── */}
            {specialisations.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-lg text-foreground font-bold">Services &amp; Specialisations</h3>
                    <div className="flex flex-wrap gap-2">
                        {specialisations.map((s) => (
                            <Badge key={s} variant="secondary">
                                {s}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Service Areas ── */}
            {serviceAreas.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-lg text-foreground font-bold">Service Areas</h3>
                    <div className="flex flex-wrap gap-2">
                        {serviceAreas.map((a) => (
                            <Badge key={a} variant="outline">
                                {a}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Credentials ── */}
            {certifications.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-lg text-foreground font-bold">Credentials</h3>
                    <div className="flex flex-wrap gap-2">
                        {certifications.map((c) => (
                            <Badge key={c} variant="secondary">
                                {c}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Honest Note ── */}
            {honestNote && (
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">{honestNote}</p>
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
                    const restDaysChrono = Array.from({ length: 5 }, (_, i) => dayOrderSunFirst[(tomorrowIndexSunFirst + 1 + i) % 7]).filter(
                        (d) => Boolean(operatingHoursByDay[d])
                    );

                    const hasRest = restDaysChrono.length > 0;
                    const showRest = showAllOperatingHours && hasRest;
                    const todayHours = operatingHoursByDay[todayDay] || '';
                    const tomorrowHours = operatingHoursByDay[tomorrowDay] || '';

                    return (
                        <>
                            <div className="flex flex-row justify-between items-center">
                                <p className="text-sm text-foreground font-medium">{todayDay}</p>
                                {isOperatingHoursLoading ? (
                                    <Skeleton className="h-4 w-24" />
                                ) : (
                                    <p className="text-sm text-muted-foreground">{todayHours || '—'}</p>
                                )}
                            </div>
                            <div className="flex flex-row justify-between items-center">
                                <p className="text-sm text-foreground font-medium">{tomorrowDay}</p>
                                {isOperatingHoursLoading ? (
                                    <Skeleton className="h-4 w-24" />
                                ) : (
                                    <p className="text-sm text-muted-foreground">{tomorrowHours || '—'}</p>
                                )}
                            </div>

                            {showRest
                                ? restDaysChrono.map((d) => (
                                      <div key={d} className="flex flex-row justify-between items-center">
                                          <p className="text-sm text-foreground font-medium">{d}</p>
                                          {isOperatingHoursLoading ? (
                                              <Skeleton className="h-4 w-24" />
                                          ) : (
                                              <p className="text-sm text-muted-foreground">{operatingHoursByDay[d] || '—'}</p>
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
                {hasMapCoords && mapsApiKey && providerLat != null && providerLng != null ? (
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
                </div>
            </div>
        </div>
    );
}
