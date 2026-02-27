'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getLocation, clearLocation } from '@/lib/location-store';
import { toast } from 'sonner';
import { ProviderCard } from '@/app/chat/_components/provider-card';
import { ProvidersMap } from '@/app/chat/_components/providers-map';
import type { Provider } from '@/app/chat/_components/types';
import { ProvidersSkeleton } from '@/app/chat/_components/skeletons';

const RADIUS_METERS = 25000; // 25 km

export function ProvidersListClient({
    initialTrade,
}: {
    initialTrade: string | null;
}) {
    const [userLocation, setUserLocation] = useState<{
        lat: number;
        lng: number;
        address?: string;
    } | null>(null);
    const [providers, setProviders] = useState<Provider[]>([]);
    const [emergingProviders, setEmergingProviders] = useState<Provider[]>([]);
    const [isLoadingProviders, setIsLoadingProviders] = useState(false);
    const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
    const [addressPopoverOpen, setAddressPopoverOpen] = useState(false);
    const [addressQuery, setAddressQuery] = useState('');
    const [addressSearching, setAddressSearching] = useState(false);
    const [addressError, setAddressError] = useState<string | null>(null);

    const trade = initialTrade ?? null;
    const hasLocation =
        typeof userLocation?.lat === 'number' &&
        typeof userLocation?.lng === 'number' &&
        !isNaN(userLocation.lat) &&
        !isNaN(userLocation.lng);

    const fetchProviders = useCallback(async (lat: number, lng: number, tradeName: string) => {
        if (!tradeName || tradeName === 'N/A') return;
        setIsLoadingProviders(true);
        try {
            const res = await fetch('/api/providers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lat,
                    lng,
                    trade: tradeName,
                    radius: RADIUS_METERS,
                }),
            });
            const data = await res.json();
            if (res.ok && data.providers) {
                setProviders((data.providers ?? []) as Provider[]);
                setEmergingProviders((data.emergingProviders ?? []) as Provider[]);
            } else {
                toast.error(data.error || "Couldn't load providers.");
                setProviders([]);
                setEmergingProviders([]);
            }
        } catch {
            toast.error("Couldn't load providers. Check your connection.");
            setProviders([]);
            setEmergingProviders([]);
        } finally {
            setIsLoadingProviders(false);
        }
    }, []);

    const applyLocationAndFetch = useCallback(
        (loc: { lat: number; lng: number; address?: string }) => {
            setUserLocation(loc);
            clearLocation();
            if (trade) fetchProviders(loc.lat, loc.lng, trade);
        },
        [trade, fetchProviders]
    );

    const handleAddressSearch = async () => {
        const q = addressQuery.trim();
        if (!q) return;
        setAddressError(null);
        setAddressSearching(true);
        try {
            const res = await fetch('/api/geocode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: q }),
            });
            const data = await res.json();
            if (!res.ok) {
                setAddressError(data.error || 'Could not find that address.');
                return;
            }
            if (data.lat != null && data.lng != null && data.address) {
                applyLocationAndFetch({
                    lat: data.lat,
                    lng: data.lng,
                    address: data.address,
                });
                setAddressPopoverOpen(false);
                setAddressQuery('');
            } else {
                setAddressError('No address found.');
            }
        } catch {
            setAddressError('Search failed. Please try again.');
        } finally {
            setAddressSearching(false);
        }
    };

    const getCurrentLocation = useCallback(() => {
        const stored = getLocation();
        if (stored && typeof stored.lat === 'number' && typeof stored.lng === 'number') {
            applyLocationAndFetch({
                lat: stored.lat,
                lng: stored.lng,
                address: stored.address,
            });
            return;
        }
        if (typeof window !== 'undefined' && !window.isSecureContext) {
            toast.error(
                'Location requires HTTPS. Please open this app via https:// for location to work.'
            );
            return;
        }
        if (typeof navigator !== 'undefined' && !navigator.geolocation) {
            toast.error('Location is not supported. Please use a modern browser.');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                try {
                    const geocodeRes = await fetch('/api/geocode', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ lat, lng }),
                    });
                    const geoData = await geocodeRes.json();
                    const address =
                        geocodeRes.ok && geoData.address
                            ? geoData.address
                            : 'Current location';
                    applyLocationAndFetch({ lat, lng, address });
                } catch {
                    applyLocationAndFetch({ lat, lng, address: 'Current location' });
                }
            },
            (err) => {
                if (err.code === 1) {
                    toast.error(
                        "Location was denied. Allow location for this site and try again."
                    );
                } else if (err.code === 3) {
                    toast.error(
                        'Location request timed out. Enable location services and try again.'
                    );
                } else {
                    toast.error('Could not get your location. Please try again.');
                }
            },
            { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 }
        );
    }, [applyLocationAndFetch]);

    // Initial load: apply stored location and fetch if we have trade
    useEffect(() => {
        if (!trade || userLocation) return;
        const stored = getLocation();
        if (stored && typeof stored.lat === 'number' && typeof stored.lng === 'number') {
            applyLocationAndFetch({
                lat: stored.lat,
                lng: stored.lng,
                address: stored.address,
            });
        }
    }, [trade]); // eslint-disable-line react-hooks/exhaustive-deps -- only run when trade is set and we have no location yet

    const mapKey =
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ||
        process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
    const allProviders = [...providers, ...emergingProviders];

    return (
        <>
            <header className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3">
                <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/">Back</Link>
                        </Button>
                        {trade && (
                            <h1 className="truncate text-lg font-semibold text-foreground">
                                {trade}
                            </h1>
                        )}
                    </div>
                </div>
            </header>

            <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
                {!trade ? (
                    <p className="text-muted-foreground">
                        Select a service from the home page to view providers.
                    </p>
                ) : (
                    <div className="space-y-6">
                        <div className="flex flex-wrap items-center gap-2">
                            {hasLocation && userLocation?.address ? (
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm text-muted-foreground">
                                        {userLocation.address}
                                    </span>
                                    <Popover
                                        open={addressPopoverOpen}
                                        onOpenChange={setAddressPopoverOpen}
                                    >
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" size="sm">
                                                Change address
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-96" align="start">
                                            <div className="flex flex-col gap-3">
                                                <p className="text-sm font-medium">
                                                    Search Address (Western Cape only)
                                                </p>
                                                <Input
                                                    placeholder="Enter address in Western Cape, South Africa"
                                                    value={addressQuery}
                                                    onChange={(e) => {
                                                        setAddressQuery(e.target.value);
                                                        setAddressError(null);
                                                    }}
                                                    onKeyDown={(e) =>
                                                        e.key === 'Enter' && handleAddressSearch()
                                                    }
                                                />
                                                {addressError && (
                                                    <p className="text-xs text-destructive">
                                                        {addressError}
                                                    </p>
                                                )}
                                                <Button
                                                    onClick={handleAddressSearch}
                                                    disabled={
                                                        addressSearching || !addressQuery.trim()
                                                    }
                                                >
                                                    {addressSearching ? 'Searching…' : 'Search'}
                                                </Button>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            ) : (
                                <>
                                    <Button onClick={getCurrentLocation}>
                                        Use my location
                                    </Button>
                                    <Popover
                                        open={addressPopoverOpen}
                                        onOpenChange={setAddressPopoverOpen}
                                    >
                                        <PopoverTrigger asChild>
                                            <Button variant="outline">Search address</Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-80" align="start">
                                            <div className="flex flex-col gap-3">
                                                <p className="text-sm font-medium">
                                                    Search Address (Western Cape only)
                                                </p>
                                                <Input
                                                    placeholder="Enter address in Western Cape, South Africa"
                                                    value={addressQuery}
                                                    onChange={(e) => {
                                                        setAddressQuery(e.target.value);
                                                        setAddressError(null);
                                                    }}
                                                    onKeyDown={(e) =>
                                                        e.key === 'Enter' && handleAddressSearch()
                                                    }
                                                    className="rounded-lg"
                                                />
                                                {addressError && (
                                                    <p className="text-xs text-destructive">
                                                        {addressError}
                                                    </p>
                                                )}
                                                <Button
                                                    size="sm"
                                                    onClick={handleAddressSearch}
                                                    disabled={
                                                        addressSearching || !addressQuery.trim()
                                                    }
                                                >
                                                    {addressSearching ? 'Searching…' : 'Search'}
                                                </Button>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </>
                            )}
                        </div>

                        {hasLocation &&
                            (isLoadingProviders ? (
                                <ProvidersSkeleton />
                            ) : allProviders.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No providers found within 25 km.
                                </p>
                            ) : (
                                <div className="flex flex-col gap-6">
                                    {mapKey && (
                                        <ProvidersMap
                                            apiKey={mapKey}
                                            providers={providers}
                                            emergingProviders={emergingProviders}
                                            userLocation={userLocation}
                                        />
                                    )}
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        {allProviders.map((p, i) => (
                                            <ProviderCard
                                                key={p.place_id ?? i}
                                                provider={p}
                                                index={i}
                                                diagnosis={null}
                                                openPopoverId={openPopoverId}
                                                setOpenPopoverId={setOpenPopoverId}
                                                trade={trade}
                                                userLocation={userLocation}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                    </div>
                )}
            </main>
        </>
    );
}