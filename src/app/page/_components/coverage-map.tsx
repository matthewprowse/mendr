'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
    const [center, setCenter] = useState(CAPE_TOWN);
    const [address, setAddress] = useState<string | null>(null);
    const [addressQuery, setAddressQuery] = useState('');
    const [addressSearching, setAddressSearching] = useState(false);
    const [addressPopoverOpen, setAddressPopoverOpen] = useState(false);
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

    const handleAddressSearch = useCallback(async () => {
        if (!addressQuery.trim()) return;
        setLocationError(null);
        setAddressSearching(true);
        try {
            const res = await fetch('/api/geocode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: addressQuery.trim() }),
            });
            const data = await res.json();
            if (res.ok && data.lat != null && data.lng != null && data.address) {
                const newCenter = { lat: data.lat, lng: data.lng };
                setCenter(newCenter);
                setAddress(data.address);
                setAddressPopoverOpen(false);
                setAddressQuery('');
                setLoading(true);
                await fetchProviders(newCenter.lat, newCenter.lng);
            } else if (data.error) {
                setLocationError(data.error);
            }
        } catch {
            setLocationError('Could not find that address.');
        } finally {
            setAddressSearching(false);
            setLoading(false);
        }
    }, [addressQuery, fetchProviders]);

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
                try {
                    const res = await fetch('/api/geocode', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ lat, lng }),
                    });
                    const data = await res.json();
                    if (res.ok && data.address) setAddress(data.address);
                } catch {
                    setAddress(null);
                }
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
            <p className="text-sm text-muted-foreground">
                Coverage shown within a 25km radius of your selected location.
            </p>
            <div className="flex flex-col gap-2">
                {address ? (
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate min-w-0">{address}</span>
                        <Popover open={addressPopoverOpen} onOpenChange={setAddressPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline">Change Location</Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-96" align="start">
                                <div className="flex flex-col gap-3">
                                    <p className="text-sm font-medium">
                                        Search Locations (Western Cape only)
                                    </p>
                                    <Input
                                        placeholder="Enter address in Western Cape, South Africa"
                                        className="text-[14px] sm:text-sm"
                                        value={addressQuery}
                                        onChange={(e) => {
                                            setAddressQuery(e.target.value);
                                            setLocationError(null);
                                        }}
                                        onKeyDown={(e) =>
                                            e.key === 'Enter' && handleAddressSearch()
                                        }
                                    />
                                    {locationError && (
                                        <p className="text-xs text-destructive">{locationError}</p>
                                    )}
                                    <Button
                                        onClick={handleAddressSearch}
                                        disabled={addressSearching || !addressQuery.trim()}
                                    >
                                        {addressSearching ? 'Searching…' : 'Search'}
                                    </Button>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="secondary" onClick={handleGetLocation}>
                            Use My Location
                        </Button>
                        <Popover open={addressPopoverOpen} onOpenChange={setAddressPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline">Search Address</Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80" align="start">
                                <div className="flex flex-col gap-3">
                                    <p className="text-sm font-semibold">Search for an address</p>
                                    <Input
                                        placeholder="Enter address or place"
                                        className="text-[14px] sm:text-sm"
                                        value={addressQuery}
                                        onChange={(e) => {
                                            setAddressQuery(e.target.value);
                                            setLocationError(null);
                                        }}
                                        onKeyDown={(e) =>
                                            e.key === 'Enter' && handleAddressSearch()
                                        }
                                    />
                                    {locationError && (
                                        <p className="text-xs text-destructive">{locationError}</p>
                                    )}
                                    <Button
                                        size="sm"
                                        onClick={handleAddressSearch}
                                        disabled={addressSearching || !addressQuery.trim()}
                                    >
                                        {addressSearching ? 'Searching…' : 'Search'}
                                    </Button>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                )}
            </div>
            {locationError && !addressPopoverOpen && (
                <p className="text-sm text-destructive">{locationError}</p>
            )}
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
