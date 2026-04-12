'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DiagnosisData, Provider } from '@/app/chat/components/types';
import { ProviderCard } from '@/app/chat/components/provider-card';
import { ProvidersMap } from '@/app/chat/components/providers-map';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from '@/lib/icons';
import { AppHeader } from '@/components/app-header';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';

/** Stable id for analytics / WhatsApp flows on this demo route (no Supabase row). */
const MATCH2_SESSION_ID = 'match2';

type MockSeed = {
    id: string;
    name: string;
    lat: number;
    lng: number;
    address: string;
    driveTime: string;
    rating: number;
    reviewCount: number;
    summary: string;
    open: boolean;
};

const MOCK_SEEDS: MockSeed[] = [
    {
        id: '1',
        name: 'CapeFlow Plumbing',
        lat: -33.9801,
        lng: 18.4668,
        address: '12 Main Road, Claremont, Cape Town',
        driveTime: '18 mins',
        rating: 4.8,
        reviewCount: 124,
        summary:
            'Fast leak response and tidy workmanship. Most customers mention clear communication and transparent pricing.',
        open: true,
    },
    {
        id: '2',
        name: 'Southside Leak Specialists',
        lat: -33.9584,
        lng: 18.4742,
        address: '22 Campground Road, Rondebosch, Cape Town',
        driveTime: '23 mins',
        rating: 4.6,
        reviewCount: 86,
        summary:
            'Strong diagnostics and same-day scheduling for urgent callouts. Good follow-up after repairs are completed.',
        open: true,
    },
    {
        id: '3',
        name: 'PipeCare Services',
        lat: -33.9756,
        lng: 18.4516,
        address: '3 Kildare Road, Newlands, Cape Town',
        driveTime: '29 mins',
        rating: 4.4,
        reviewCount: 63,
        summary:
            'Good option for planned maintenance jobs and non-emergency repairs. Customers highlight courteous technicians.',
        open: false,
    },
    {
        id: '4',
        name: 'Neighbourhood Plumbing Co.',
        lat: -33.9867,
        lng: 18.4699,
        address: '55 Imam Haron Road, Claremont, Cape Town',
        driveTime: '31 mins',
        rating: 4.3,
        reviewCount: 52,
        summary:
            'Reliable smaller team with practical fixes and reasonable pricing. Helpful for repeat household plumbing issues.',
        open: true,
    },
    {
        id: '5',
        name: 'Urban Water Fix',
        lat: -34.0092,
        lng: 18.4824,
        address: '90 Belvedere Road, Kenilworth, Cape Town',
        driveTime: '34 mins',
        rating: 4.1,
        reviewCount: 41,
        summary:
            'Solid all-round provider for everyday plumbing tasks. Reviewers often mention punctual arrivals.',
        open: true,
    },
    {
        id: '6',
        name: 'Metro Leak & Repair',
        lat: -34.0237,
        lng: 18.466,
        address: '17 Stanhope Road, Plumstead, Cape Town',
        driveTime: '37 mins',
        rating: 4.0,
        reviewCount: 29,
        summary:
            'Useful backup option with straightforward booking and communication via phone and WhatsApp.',
        open: false,
    },
];

function seedsToProviders(seeds: MockSeed[]): Provider[] {
    return seeds.map((p, i) => ({
        name: p.name,
        address: p.address,
        latitude: p.lat,
        longitude: p.lng,
        rating: p.rating,
        ratingCount: p.reviewCount,
        summary: p.summary,
        isOpen: p.open,
        durationText: p.driveTime,
        place_id: `match2_place_${p.id}`,
        id: p.id,
        isFavourite: i === 0,
    }));
}

const MOCK_DIAGNOSIS: DiagnosisData = {
    thinking: '',
    diagnosis: 'Suspected leak under the kitchen sink with visible moisture.',
    trade: 'Plumbing',
    action_required: 'Inspect and repair or replace affected piping.',
    estimated_cost: '',
};

export default function Match2PageClient() {
    const router = useRouter();
    const [activeIndex, setActiveIndex] = useState(0);
    const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

    const providers = useMemo(() => seedsToProviders(MOCK_SEEDS), []);

    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setUserLocation({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                });
            },
            () => {},
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
        );
    }, []);

    const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

    const currentProvider =
        providers.length > 0 && activeIndex >= 0 && activeIndex < providers.length
            ? providers[activeIndex]
            : providers[0] ?? null;

    return (
        <main className="flex min-h-screen flex-col bg-background">
            <AppHeader
                showBack
                showNewScan
                onNewScanClick={() => router.push('/welcome')}
            />
            <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 pb-24 pt-6 sm:max-w-lg">
                <header className="flex flex-col gap-2">
                    <h1 className="text-2xl text-foreground font-bold tracking-tight">
                        Provider Matches
                    </h1>
                    {MOCK_DIAGNOSIS.diagnosis && (
                        <p className="text-sm text-muted-foreground">
                            Based on your diagnosis of{' '}
                            <span className="font-medium text-foreground">
                                {MOCK_DIAGNOSIS.diagnosis}
                            </span>
                            , here are nearby providers that look like a good fit.
                        </p>
                    )}
                </header>

                <Separator />

                <section className="space-y-6">
                    <div className="space-y-2">
                        <Label className="text-base text-foreground font-medium">
                            Recommended providers
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            Use the arrows below to compare providers. Tap a card to view contact
                            options or send a WhatsApp summary.
                        </p>
                    </div>
                    {currentProvider && (
                        <div className="space-y-4">
                            <ProviderCard
                                provider={currentProvider}
                                index={activeIndex}
                                diagnosis={MOCK_DIAGNOSIS}
                                conversationId={MATCH2_SESSION_ID}
                                openPopoverId={openPopoverId}
                                setOpenPopoverId={setOpenPopoverId}
                                trade={MOCK_DIAGNOSIS.trade}
                                userLocation={userLocation}
                            />
                            {providers.length > 1 && (
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="outline"
                                            aria-label="Previous provider"
                                            className="h-10 w-10"
                                            onClick={() =>
                                                setActiveIndex(
                                                    (activeIndex - 1 + providers.length) %
                                                        providers.length
                                                )
                                            }
                                        >
                                            <ArrowLeft className="size-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="outline"
                                            aria-label="Next provider"
                                            className="h-10 w-10"
                                            onClick={() =>
                                                setActiveIndex((activeIndex + 1) % providers.length)
                                            }
                                        >
                                            <ArrowRight className="size-4" />
                                        </Button>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {providers.map((_, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                onClick={() => setActiveIndex(i)}
                                                aria-label={`Go to provider ${i + 1}`}
                                                className={`size-1.5 rounded-full transition-colors ${
                                                    i === activeIndex
                                                        ? 'bg-foreground'
                                                        : 'bg-muted-foreground/40 hover:bg-muted-foreground/60'
                                                }`}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {providers.length > 0 && mapsApiKey && currentProvider && (
                    <section className="space-y-3">
                        <Label className="text-base text-foreground font-medium">Map</Label>
                        <div className="w-full max-w-full overflow-hidden rounded-lg border border-input/50 bg-background">
                            <ProvidersMap
                                apiKey={mapsApiKey}
                                providers={providers}
                                emergingProviders={[]}
                                nearbyOnlyProviders={[]}
                                userLocation={userLocation}
                                conversationId={MATCH2_SESSION_ID}
                                hideFloatingCard
                                mode="rank"
                                activeIndex={activeIndex}
                                onActiveIndexChange={setActiveIndex}
                                className="w-full overflow-hidden"
                            />
                            <div className="border-t border-border px-4 py-3 text-sm flex flex-col gap-2">
                                <div className="text-sm font-semibold text-foreground">
                                    {currentProvider.name}
                                </div>
                                {currentProvider.address && (
                                    <div className="text-xs text-muted-foreground">
                                        {currentProvider.address}
                                    </div>
                                )}
                                <div className="pt-1">
                                    <Button asChild type="button" className="w-full">
                                        <a
                                            href={(() => {
                                                const origin = userLocation
                                                    ? `${userLocation.lat},${userLocation.lng}`
                                                    : '';
                                                const hasCoords =
                                                    typeof currentProvider.latitude === 'number' &&
                                                    typeof currentProvider.longitude === 'number';
                                                const destination = hasCoords
                                                    ? `${currentProvider.latitude},${currentProvider.longitude}`
                                                    : encodeURIComponent(currentProvider.address || '');
                                                const params = new URLSearchParams({
                                                    api: '1',
                                                    destination,
                                                    travelmode: 'driving',
                                                });
                                                if (origin) params.set('origin', origin);
                                                return `https://www.google.com/maps/dir/?${params.toString()}`;
                                            })()}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            Get Directions
                                        </a>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </main>
    );
}
