'use client';

import { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatBusinessName } from '@/lib/utils';

type ProviderDirectionsMapProps = {
    apiKey: string;
    provider: {
        name: string;
        latitude?: number | null;
        longitude?: number | null;
        address?: string | null;
    };
    mapsUrl?: string | null;
};

function formatDuration(text: string): string {
    if (!text) return '';
    return text.replace(/\bmins?\b/gi, 'Minutes').replace(/\bhrs?\b/gi, 'Hours');
}

function haversineKm(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number }
): number {
    const R = 6371;
    const dLat = ((to.lat - from.lat) * Math.PI) / 180;
    const dLon = ((to.lng - from.lng) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((from.lat * Math.PI) / 180) *
            Math.cos((to.lat * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

let mapsOptionsSet = false;

export function ProviderDirectionsMap({ apiKey, provider, mapsUrl }: ProviderDirectionsMapProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
    const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);

    const [loading, setLoading] = useState(true);
    const [mapError, setMapError] = useState<string | null>(null);
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [durationText, setDurationText] = useState('');
    const [distanceKm, setDistanceKm] = useState<number | null>(null);

    const hasCoords =
        typeof provider.latitude === 'number' && typeof provider.longitude === 'number';

    useEffect(() => {
        if (!apiKey || !containerRef.current || !hasCoords) {
            setLoading(false);
            return;
        }

        if (!mapsOptionsSet) {
            setOptions({ key: apiKey, v: 'weekly' });
            mapsOptionsSet = true;
        }

        const timeout = setTimeout(() => {
            setMapError('Map is taking longer than expected to load.');
            setLoading(false);
        }, 15000);

        Promise.all([importLibrary('maps'), importLibrary('routes')])
            .then(() => {
                clearTimeout(timeout);
                if (!containerRef.current || !hasCoords) return;

                const map = new google.maps.Map(containerRef.current, {
                    center: { lat: provider.latitude!, lng: provider.longitude! },
                    zoom: 13,
                    disableDefaultUI: true,
                    zoomControl: true,
                    streetViewControl: false,
                    fullscreenControl: false,
                    mapId: 'provider-directions-map',
                });

                mapRef.current = map;

                new google.maps.Marker({
                    map,
                    position: { lat: provider.latitude!, lng: provider.longitude! },
                    title: provider.name,
                });

                directionsServiceRef.current = new google.maps.DirectionsService();
                directionsRendererRef.current = new google.maps.DirectionsRenderer({
                    suppressMarkers: true,
                    polylineOptions: {
                        strokeColor: '#0f172a',
                        strokeWeight: 4,
                        strokeOpacity: 0.8,
                    },
                });

                setLoading(false);
            })
            .catch(() => {
                clearTimeout(timeout);
                setMapError('Could not load map.');
                setLoading(false);
            });

        return () => {
            directionsRendererRef.current?.setMap(null);
            directionsRendererRef.current = null;
            directionsServiceRef.current = null;
            mapRef.current = null;
        };
    }, [apiKey, hasCoords, provider.latitude, provider.longitude, provider.name]);

    useEffect(() => {
        if (!hasCoords || typeof window === 'undefined') return;

        if (!navigator.geolocation) {
            setLocationError('Location is not available in this browser.');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setUserLocation(loc);

                if (!provider.latitude || !provider.longitude) return;

                const km = haversineKm(loc, {
                    lat: provider.latitude,
                    lng: provider.longitude,
                });
                setDistanceKm(km);

                const service = directionsServiceRef.current;
                const renderer = directionsRendererRef.current;
                const map = mapRef.current;
                if (!service || !renderer || !map) return;

                renderer.setMap(map);

                service.route(
                    {
                        origin: loc,
                        destination: {
                            lat: provider.latitude,
                            lng: provider.longitude,
                        },
                        travelMode: google.maps.TravelMode.DRIVING,
                    },
                    (result, status) => {
                        if (status === google.maps.DirectionsStatus.OK && result) {
                            renderer.setDirections(result);
                            const text =
                                result.routes?.[0]?.legs?.[0]?.duration?.text ??
                                '';
                            setDurationText(text);
                        }
                    }
                );
            },
            () => {
                setLocationError('We could not access your location.');
            },
            { timeout: 10000 }
        );
    }, [hasCoords, provider.latitude, provider.longitude]);

    const displayName = formatBusinessName(provider.name);
    const distanceLabel =
        distanceKm != null ? `${distanceKm.toFixed(1)} km` : null;

    return (
        <Card className="border-border/70 bg-card overflow-hidden">
            <CardContent className="p-0">
                <div className="relative h-64 w-full sm:h-80">
                    {loading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/40">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                        </div>
                    )}
                    <div ref={containerRef} className="h-full w-full" />
                    {(mapError || locationError) && (
                        <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-col gap-1 rounded-md bg-background/95 p-3 text-xs text-muted-foreground shadow-sm">
                            {mapError && <p>{mapError}</p>}
                            {locationError && <p>{locationError}</p>}
                        </div>
                    )}

                    <div className="absolute bottom-3 left-3 right-3 z-10">
                        <div className="flex flex-col gap-2 rounded-md bg-background/95 p-3 shadow-sm border border-border/70">
                            <div className="flex flex-col gap-0.5">
                                <p className="text-sm font-semibold text-foreground truncate">
                                    {displayName}
                                </p>
                                {provider.address && (
                                    <p className="text-xs text-muted-foreground truncate">
                                        {provider.address}
                                    </p>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {distanceLabel && (
                                        <Badge
                                            variant="outline"
                                            className="text-[11px] font-medium"
                                        >
                                            {distanceLabel} away
                                        </Badge>
                                    )}
                                    {durationText && (
                                        <Badge
                                            variant="outline"
                                            className="text-[11px] font-medium"
                                        >
                                            {formatDuration(durationText)} drive
                                        </Badge>
                                    )}
                                </div>
                                {mapsUrl && (
                                    <Button
                                        asChild
                                        size="sm"
                                        variant="secondary"
                                        className="h-7 px-3 text-xs font-medium"
                                    >
                                        <a
                                            href={mapsUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            Get directions
                                        </a>
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

