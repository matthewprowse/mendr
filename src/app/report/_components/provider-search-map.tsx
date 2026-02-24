'use client';

import { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

export type ReportProvider = {
    place_id: string;
    name: string;
    address: string;
    latitude?: number;
    longitude?: number;
    rating?: number;
    ratingCount?: number;
};

type ProviderSearchMapProps = {
    apiKey: string;
    providers: ReportProvider[];
    selectedPlaceId: string | null;
    onSelectProvider: (provider: ReportProvider) => void;
};

export function ProviderSearchMap({
    apiKey,
    providers,
    selectedPlaceId,
    onSelectProvider,
}: ProviderSearchMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const markersRef = useRef<google.maps.Marker[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const validProviders = providers.filter((p) => p.latitude != null && p.longitude != null);

    useEffect(() => {
        if (!apiKey || !containerRef.current) return;

        setOptions({ key: apiKey, v: 'weekly' });
        importLibrary('maps')
            .then(() => {
                if (!containerRef.current) return;
                const map = new google.maps.Map(containerRef.current, {
                    center: { lat: -33.9249, lng: 18.4241 },
                    zoom: 10,
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
        if (!mapRef.current || !validProviders.length) return;

        const map = mapRef.current;

        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = [];

        const bounds = new google.maps.LatLngBounds();

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

            marker.addListener('click', () => {
                onSelectProvider(provider);
            });
        });

        if (validProviders.length > 1) {
            map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
        } else if (validProviders.length === 1) {
            map.setCenter({
                lat: validProviders[0].latitude!,
                lng: validProviders[0].longitude!,
            });
            map.setZoom(14);
        }
    }, [validProviders, onSelectProvider]);

    if (error) {
        return (
            <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                {error}
            </div>
        );
    }

    return (
        <div className="relative w-full overflow-hidden rounded-lg border border-border">
            <div className="aspect-video min-h-[200px] w-full">
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
