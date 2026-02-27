'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { formatBusinessName } from '@/lib/utils';

const PIN_PATH =
    'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z';

type ProviderLocationMapProps = {
    apiKey: string;
    providerLat: number;
    providerLng: number;
    providerName: string;
    directionsUrl: string;
    providerAddress?: string | null;
    providerPlaceId?: string;
};

export function ProviderLocationMap({
    apiKey,
    providerLat,
    providerLng,
    providerName,
    directionsUrl,
    providerAddress,
    providerPlaceId,
}: ProviderLocationMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
    const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [directionsDrawn, setDirectionsDrawn] = useState(false);
    const [liveDuration, setLiveDuration] = useState<string | null>(null);
    const [liveDistance, setLiveDistance] = useState<string | null>(null);

    const userLocationRef = useRef(userLocation);
    userLocationRef.current = userLocation;

    const displayName = formatBusinessName(providerName);

    const drawDirections = useCallback(() => {
        const map = mapRef.current;
        const service = directionsServiceRef.current;
        const renderer = directionsRendererRef.current;
        const loc = userLocationRef.current;
        if (!map || !service || !renderer || !loc) return;

        renderer.setMap(map);
        service.route(
            {
                origin: { lat: loc.lat, lng: loc.lng },
                destination: { lat: providerLat, lng: providerLng },
                travelMode: google.maps.TravelMode.DRIVING,
            },
            (result, status) => {
                if (status === google.maps.DirectionsStatus.OK && result) {
                    renderer.setDirections(result);
                    setDirectionsDrawn(true);
                    const leg = result.routes?.[0]?.legs?.[0];
                    if (leg?.duration?.text) setLiveDuration(leg.duration.text);
                    if (leg?.distance?.text) setLiveDistance(leg.distance.text);
                } else {
                    renderer.setMap(null);
                    const bounds = new google.maps.LatLngBounds();
                    bounds.extend({ lat: loc.lat, lng: loc.lng });
                    bounds.extend({ lat: providerLat, lng: providerLng });
                    map.fitBounds(bounds, { top: 60, right: 60, bottom: 200, left: 60 });
                }
            }
        );
    }, [providerLat, providerLng]);

    useEffect(() => {
        if (!apiKey || !containerRef.current) return;

        setOptions({ key: apiKey, v: 'weekly' });

        Promise.all([importLibrary('maps'), importLibrary('routes')])
            .then(() => {
                if (!containerRef.current) return;

                const map = new google.maps.Map(containerRef.current, {
                    center: { lat: providerLat, lng: providerLng },
                    zoom: 14,
                    disableDefaultUI: true,
                    zoomControl: false,
                    mapTypeControl: false,
                    scaleControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                });

                mapRef.current = map;
                directionsServiceRef.current = new google.maps.DirectionsService();
                directionsRendererRef.current = new google.maps.DirectionsRenderer({
                    suppressMarkers: true,
                    polylineOptions: {
                        strokeColor: '#0f172a',
                        strokeWeight: 4,
                        strokeOpacity: 0.8,
                    },
                });

                // Provider pin — red teardrop
                new google.maps.Marker({
                    map,
                    position: { lat: providerLat, lng: providerLng },
                    title: providerName,
                    icon: {
                        path: PIN_PATH,
                        fillColor: '#EA4335',
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 1.5,
                        scale: 1.8,
                        anchor: new google.maps.Point(12, 22),
                    },
                    zIndex: 10,
                });

                setLoading(false);

                if (typeof navigator !== 'undefined' && navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                            setUserLocation(loc);
                            userLocationRef.current = loc;

                            new google.maps.Marker({
                                map,
                                position: loc,
                                title: 'Your location',
                                zIndex: 20,
                                icon: {
                                    path: google.maps.SymbolPath.CIRCLE,
                                    scale: 10,
                                    fillColor: '#3b82f6',
                                    fillOpacity: 1,
                                    strokeColor: '#fff',
                                    strokeWeight: 2,
                                },
                            });

                            drawDirections();
                        },
                        () => {
                            // Permission denied — show provider pin only
                        },
                        { timeout: 6000 }
                    );
                }
            })
            .catch(() => {
                setError('Could not load map.');
                setLoading(false);
            });

        return () => {
            directionsRendererRef.current?.setMap(null);
            directionsRendererRef.current = null;
            directionsServiceRef.current = null;
            mapRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiKey, providerLat, providerLng, providerName]);

    useEffect(() => {
        if (!userLocation || !mapRef.current) return;
        drawDirections();
    }, [userLocation, drawDirections]);

    if (error) {
        return (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                Map unavailable
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-xl border border-border">
            {/* Map — taller on all screen sizes */}
            <div className="relative h-72 w-full sm:h-96">
                {loading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/50">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                    </div>
                )}
                <div ref={containerRef} className="h-full w-full" />
            </div>

            {/* Provider info card — below the map, full width */}
            {!loading && (
                <div className="border-t border-border bg-background px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                        {/* Left: name + address + travel meta */}
                        <div className="min-w-0 flex-1 space-y-1">
                            <p className="truncate text-sm font-semibold text-foreground" title={displayName}>
                                {displayName}
                            </p>
                            {providerAddress && (
                                <p className="text-sm text-muted-foreground leading-snug">
                                    {providerAddress}
                                </p>
                            )}
                            {(liveDistance || liveDuration) && (
                                <p className="text-xs text-muted-foreground">
                                    {[liveDistance, liveDuration && `${liveDuration} drive`]
                                        .filter(Boolean)
                                        .join(' · ')}
                                </p>
                            )}
                            {!directionsDrawn && !liveDistance && (
                                <p className="text-xs text-muted-foreground/60">
                                    Allow location access to see driving distance
                                </p>
                            )}
                        </div>

                        {/* Right: Get Directions button */}
                        <a
                            href={directionsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted whitespace-nowrap"
                        >
                            Get Directions
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
