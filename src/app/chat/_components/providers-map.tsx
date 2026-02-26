'use client';

import { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import type { Provider } from './types';

type ProvidersMapProps = {
    apiKey: string;
    providers: Provider[];
    emergingProviders?: Provider[];
    userLocation: { lat: number; lng: number; address?: string } | null;
};

export function ProvidersMap({
    apiKey,
    providers,
    emergingProviders = [],
    userLocation,
}: ProvidersMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const markersRef = useRef<google.maps.Marker[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const allProviders = [...(providers ?? []), ...emergingProviders];
    const validProviders = allProviders.filter((p) => p.latitude != null && p.longitude != null);

    useEffect(() => {
        if (!apiKey || !containerRef.current) return;

        setOptions({ key: apiKey, v: 'weekly' });
        importLibrary('maps')
            .then(() => {
                if (!containerRef.current) return;
                const center = userLocation
                    ? { lat: userLocation.lat, lng: userLocation.lng }
                    : { lat: -33.9249, lng: 18.4241 };
                const map = new google.maps.Map(containerRef.current, {
                    center,
                    zoom: 12,
                    disableDefaultUI: true,
                    zoomControl: true,
                    mapTypeControl: false,
                    scaleControl: false,
                    streetViewControl: false,
                    fullscreenControl: true,
                });
                mapRef.current = map;
                setLoading(false);
            })
            .catch(() => {
                setError('Could not load map.');
                setLoading(false);
            });

        return () => {
            mapRef.current = null;
        };
    }, [apiKey]);

    useEffect(() => {
        if (!mapRef.current) return;

        const map = mapRef.current;

        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = [];

        const bounds = new google.maps.LatLngBounds();

        if (
            userLocation &&
            typeof userLocation.lat === 'number' &&
            typeof userLocation.lng === 'number'
        ) {
            const userPos = { lat: userLocation.lat, lng: userLocation.lng };
            bounds.extend(userPos);

            const userMarker = new google.maps.Marker({
                map,
                position: userPos,
                title: 'Your location',
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 10,
                    fillColor: '#3b82f6',
                    fillOpacity: 1,
                    strokeColor: '#fff',
                    strokeWeight: 2,
                },
            });
            markersRef.current.push(userMarker);
        }

        validProviders.forEach((provider) => {
            const pos = {
                lat: provider.latitude!,
                lng: provider.longitude!,
            };
            bounds.extend(pos);

            const marker = new google.maps.Marker({
                map,
                position: pos,
                title: provider.name,
            });
            markersRef.current.push(marker);
        });

        if (validProviders.length > 0 || userLocation) {
            try {
                const ne = bounds.getNorthEast();
                const sw = bounds.getSouthWest();
                if (ne.equals(sw)) {
                    map.setCenter(bounds.getCenter());
                    map.setZoom(14);
                } else {
                    map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
                }
            } catch {
                if (userLocation) {
                    map.setCenter({ lat: userLocation.lat, lng: userLocation.lng });
                    map.setZoom(12);
                }
            }
        }
    }, [validProviders, userLocation]);

    if (error) {
        return (
            <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                {error}
            </div>
        );
    }

    return (
        <div className="relative w-full overflow-hidden rounded-lg border border-border">
            <div className="aspect-[16/10] min-h-[180px] w-full">
                {loading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/50">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                    </div>
                )}
                <div ref={containerRef} className="h-full w-full" />
            </div>
        </div>
    );
}
