'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { Button } from '@/components/ui/button';

const CAPE_TOWN = { lat: -33.9249, lng: 18.4241 };

type CoverageProvider = {
    place_id: string;
    name: string;
    address: string;
    latitude?: number;
    longitude?: number;
    rating?: number;
    ratingCount?: number;
};

type CoverageMapProps = {
    apiKey: string;
};

export function CoverageMap({ apiKey }: CoverageMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const markersRef = useRef<google.maps.Marker[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [providers, setProviders] = useState<CoverageProvider[]>([]);
    const [searchValue, setSearchValue] = useState('');
    const [center, setCenter] = useState(CAPE_TOWN);
    const [locationError, setLocationError] = useState<string | null>(null);

    const fetchProviders = useCallback(async (lat: number, lng: number) => {
        try {
            const res = await fetch('/api/providers/coverage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lng }),
            });
            const data = await res.json();
            if (res.ok && data.providers) {
                setProviders(data.providers);
            }
        } catch {
            setProviders([]);
        }
    }, []);

    useEffect(() => {
        if (!apiKey || !containerRef.current) return;

        setOptions({ key: apiKey, v: 'weekly' });
        importLibrary('maps')
            .then(() => {
                if (!containerRef.current) return;
                const map = new google.maps.Map(containerRef.current, {
                    center,
                    zoom: 11,
                    disableDefaultUI: true,
                    zoomControl: true,
                    mapTypeControl: true,
                    scaleControl: true,
                    streetViewControl: false,
                    fullscreenControl: true,
                });
                mapRef.current = map;
                setLoading(false);
                fetchProviders(center.lat, center.lng);
            })
            .catch(() => {
                setError('Could not load map.');
                setLoading(false);
            });

        return () => {
            mapRef.current = null;
            markersRef.current = [];
        };
    }, [apiKey]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!mapRef.current) return;
        mapRef.current.setCenter(center);
    }, [center]);

    useEffect(() => {
        if (!mapRef.current) return;

        const map = mapRef.current;
        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = [];

        const validProviders = providers.filter((p) => p.latitude != null && p.longitude != null);

        validProviders.forEach((provider) => {
            const pos = {
                lat: provider.latitude!,
                lng: provider.longitude!,
            };
            const marker = new google.maps.Marker({
                map,
                position: pos,
                title: provider.name,
            });
            markersRef.current.push(marker);
        });

        if (validProviders.length > 1) {
            const bounds = new google.maps.LatLngBounds();
            validProviders.forEach((p) => bounds.extend({ lat: p.latitude!, lng: p.longitude! }));
            map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
        }
    }, [providers]);

    const handleSearch = useCallback(async () => {
        if (!searchValue.trim()) return;
        setLocationError(null);
        setLoading(true);
        try {
            const res = await fetch('/api/geocode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: searchValue.trim() }),
            });
            const data = await res.json();
            if (res.ok && data.lat != null && data.lng != null) {
                const newCenter = { lat: data.lat, lng: data.lng };
                setCenter(newCenter);
                await fetchProviders(newCenter.lat, newCenter.lng);
            } else if (data.error) {
                setLocationError(data.error);
            }
        } catch {
            setLocationError('Could not find that address.');
        } finally {
            setLoading(false);
        }
    }, [searchValue, fetchProviders]);

    const handleGetLocation = useCallback(async () => {
        if (!navigator.geolocation) return;
        setLocationError(null);
        setLoading(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                const inWesternCape = lat >= -35 && lat <= -31 && lng >= 17 && lng <= 26;
                if (!inWesternCape) {
                    setLocationError(
                        'Your location is outside Western Cape, South Africa. Please search for an address in the Western Cape.'
                    );
                    setLoading(false);
                    return;
                }
                setLocationError(null);
                setCenter({ lat, lng });
                await fetchProviders(lat, lng);
                setLoading(false);
            },
            () => {
                setLocationError('Could not get your location.');
                setLoading(false);
            }
        );
    }, [fetchProviders]);

    if (error) {
        return (
            <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                {error}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                    type="text"
                    placeholder="Enter address in Western Cape, South Africa"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <div className="flex gap-2">
                    <Button variant="secondary" size="default" onClick={handleSearch}>
                        Search
                    </Button>
                    <Button variant="secondary" size="default" onClick={handleGetLocation}>
                        Use Current Location
                    </Button>
                </div>
            </div>
            {locationError && <p className="text-sm text-destructive">{locationError}</p>}
            <div className="relative w-full overflow-hidden rounded-lg border border-border">
                <div className="aspect-[21/9] min-h-[340px] w-full">
                    {loading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/50">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                        </div>
                    )}
                    <div ref={containerRef} className="h-full w-full" />
                </div>
            </div>
        </div>
    );
}
