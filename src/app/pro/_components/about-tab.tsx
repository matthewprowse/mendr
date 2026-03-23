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
    } = props;

    return (
        <div className="flex flex-col gap-6 mt-6">
            <div className="flex flex-col gap-2">
                <h3 className="text-lg text-foreground font-bold">Summary</h3>
                <p className="text-sm text-foreground">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
                </p>
            </div>

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
