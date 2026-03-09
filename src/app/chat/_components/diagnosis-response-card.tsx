'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { sanitizeAiContent } from '@/lib/utils';
import { toTitleCase } from '@/lib/services';
import { DiagnosisData, Provider } from './types';
import { ProviderCard } from './provider-card';
import { ProvidersMap } from './providers-map';
import { ServiceTradeLink } from './service-trade-link';
import { ProvidersSkeleton } from './skeletons';

export function DiagnosisResponseCard({
    conversationId,
    diagnosis,
    providers,
    emergingProviders = [],
    nearbyOnlyProviders = [],
    isLoadingProviders,
    userLocation,
    onRequestLocation,
    onAddressSelect,
    onConfirmYes,
    onConfirmNo,
    diagnosisConfirmed,
    trade,
    openPopoverId,
    setOpenPopoverId,
    hasImage = true,
    providerRadiusKm = 25,
    onRadiusChange,
}: {
    conversationId?: string;
    diagnosis: DiagnosisData;
    providers: Provider[];
    emergingProviders?: Provider[];
    nearbyOnlyProviders?: Provider[];
    isLoadingProviders: boolean;
    userLocation: { lat: number; lng: number; address?: string } | null;
    onRequestLocation: (trade?: string) => void;
    onAddressSelect: (loc: { lat: number; lng: number; address: string }) => void;
    onConfirmYes?: () => void;
    onConfirmNo?: () => void;
    diagnosisConfirmed: boolean | null;
    trade: string | undefined;
    openPopoverId: string | null;
    setOpenPopoverId: (id: string | null) => void;
    hasImage?: boolean;
    providerRadiusKm?: number;
    onRadiusChange?: (km: number) => void;
}) {
    const [addressPopoverOpen, setAddressPopoverOpen] = useState(false);
    const [addressQuery, setAddressQuery] = useState('');
    const [addressSearching, setAddressSearching] = useState(false);
    const [addressError, setAddressError] = useState<string | null>(null);

    const isUnrelated = diagnosis.rejected || diagnosis.requires_clarification;
    const confidence = diagnosis.confidence ?? 100;
    const canShowProviders = !isUnrelated && trade && trade !== 'N/A' && confidence >= 85;
    const hasLocation =
        typeof userLocation?.lat === 'number' &&
        typeof userLocation?.lng === 'number' &&
        !isNaN(userLocation.lat) &&
        !isNaN(userLocation.lng);

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
                onAddressSelect({ lat: data.lat, lng: data.lng, address: data.address });
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

    return (
        <div className="w-full space-y-6">
            {diagnosis.diagnosis && !diagnosis.requires_clarification && (
                <>
                    <div className="mt-3 space-y-2">
                        {trade && trade !== 'N/A' && <ServiceTradeLink trade={trade} />}
                        <h1 className="text-xl font-semibold">
                            {toTitleCase(diagnosis.diagnosis)}
                        </h1>
                        {diagnosis.action_required && diagnosis.action_required !== 'N/A' && (
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                {sanitizeAiContent(diagnosis.action_required)}
                            </p>
                        )}
                    </div>
                    {diagnosis.estimated_cost && diagnosis.estimated_cost !== 'N/A' && (
                        <div className="flex flex-col gap-1">
                            <h3 className="text-md font-semibold text-foreground">
                                Estimated Repair Cost
                            </h3>
                            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                                {sanitizeAiContent(diagnosis.estimated_cost)}
                            </p>
                        </div>
                    )}
                    {canShowProviders &&
                        diagnosisConfirmed === null &&
                        onConfirmYes &&
                        onConfirmNo && (
                            <div className="flex flex-row items-center gap-4 mt-4">
                                <p className="flex-1 text-sm text-muted-foreground">
                                    Does this diagnosis sound correct?
                                </p>
                                <div className="flex-1 flex flex-row gap-3">
                                    <Button variant="default" size="sm" onClick={onConfirmYes}>
                                        Yes
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={onConfirmNo}>
                                        No
                                    </Button>
                                </div>
                            </div>
                        )}
                </>
            )}

            {canShowProviders && diagnosisConfirmed === true && (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                        {hasLocation && userLocation?.address ? (
                            <>
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-medium truncate min-w-0">
                                        {userLocation.address}
                                    </span>
                                    <Popover
                                        open={addressPopoverOpen}
                                        onOpenChange={setAddressPopoverOpen}
                                    >
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" size="sm" className="shrink-0">
                                                Change Location
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
                                                    disabled={addressSearching || !addressQuery.trim()}
                                                >
                                                    {addressSearching ? 'Searching…' : 'Search'}
                                                </Button>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                {onRadiusChange && (
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs text-muted-foreground">Search within</span>
                                        {[10, 25, 50].map((km) => (
                                            <Button
                                                key={km}
                                                variant={providerRadiusKm === km ? 'secondary' : 'ghost'}
                                                size="sm"
                                                className="h-7 px-2 text-xs"
                                                onClick={() => onRadiusChange(km)}
                                                disabled={isLoadingProviders}
                                            >
                                                {km} km
                                            </Button>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : null}
                        {!hasLocation && onRequestLocation && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button onClick={() => onRequestLocation(trade)}>
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
                                </div>
                        )}
                    </div>
                    {hasLocation &&
                        (isLoadingProviders ? (
                            <ProvidersSkeleton />
                        ) : providers.length === 0 &&
                          emergingProviders.length === 0 &&
                          (nearbyOnlyProviders?.length ?? 0) === 0 ? (
                            <p className="text-sm text-muted-foreground py-2">
                                No providers found in your area.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-6">
                                {(providers.length +
                                    emergingProviders.length +
                                    (nearbyOnlyProviders?.length ?? 0)) > 0 &&
                                    (process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ||
                                        process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY) && (
                                        <ProvidersMap
                                            apiKey={
                                                process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ||
                                                process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
                                                ''
                                            }
                                            providers={providers}
                                            emergingProviders={emergingProviders}
                                            nearbyOnlyProviders={nearbyOnlyProviders}
                                            userLocation={userLocation}
                                        />
                                    )}
                                {(() => {
                                    const favourite = providers.find((p) => p.isFavourite);
                                    const others = providers.filter((p) => !p.isFavourite);
                                    return (
                                        <>
                                            {favourite && (
                                                <div className="flex flex-col gap-6">
                                                    <Separator className="w-full" />
                                                    <div className="flex flex-col gap-0.5">
                                                        <h2 className="text-lg font-semibold text-foreground">
                                                            Scandio&apos;s Pick
                                                        </h2>
                                                        {favourite.favouriteReason && (
                                                            <p className="text-sm text-foreground">
                                                                {sanitizeAiContent(
                                                                    favourite.favouriteReason
                                                                )}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <ProviderCard
                                                        provider={favourite}
                                                        index={0}
                                                        diagnosis={diagnosis}
                                                        conversationId={conversationId}
                                                        openPopoverId={openPopoverId}
                                                        setOpenPopoverId={setOpenPopoverId}
                                                        trade={trade}
                                                        userLocation={userLocation}
                                                    />
                                                </div>
                                            )}
                                            {others.length > 0 && (
                                                <>
                                                    <div className="flex flex-col gap-0.5">
                                                        <h3 className="text-lg font-semibold text-foreground">
                                                            Other Recommended Providers
                                                        </h3>
                                                        <p className="text-sm text-foreground leading-relaxed">
                                                            Compare these providers based on ratings,
                                                            reviews, and availability to find the best
                                                            fit for you.
                                                        </p>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        {others.map((p, i) => (
                                                            <ProviderCard
                                                                key={i}
                                                                provider={p}
                                                                index={i + (favourite ? 1 : 0)}
                                                                diagnosis={diagnosis}
                                                                conversationId={conversationId}
                                                                openPopoverId={openPopoverId}
                                                                setOpenPopoverId={setOpenPopoverId}
                                                                trade={trade}
                                                                userLocation={userLocation}
                                                            />
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                            {emergingProviders.length > 0 && (
                                                <>
                                                    <Separator className="w-full" />
                                                    <div className="flex flex-col gap-0.5">
                                                        <h3 className="text-lg font-semibold text-foreground">
                                                            Emerging Providers
                                                        </h3>
                                                        <p className="text-sm text-foreground leading-relaxed">
                                                            Good reviews but fewer of them, newer
                                                            businesses worth considering.
                                                        </p>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        {emergingProviders.map((p, i) => (
                                                            <ProviderCard
                                                                key={i}
                                                                provider={p}
                                                                index={providers.length + i}
                                                                diagnosis={diagnosis}
                                                                conversationId={conversationId}
                                                                openPopoverId={openPopoverId}
                                                                setOpenPopoverId={setOpenPopoverId}
                                                                trade={trade}
                                                                userLocation={userLocation}
                                                            />
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                            {(nearbyOnlyProviders?.length ?? 0) > 0 &&
                                                (providers.length + (emergingProviders?.length ?? 0)) < 6 && (
                                                <>
                                                    <Separator className="w-full" />
                                                    <div className="flex flex-col gap-0.5">
                                                        <h3 className="text-lg font-semibold text-foreground">
                                                            Other Providers in Area
                                                        </h3>
                                                        <p className="text-sm text-foreground leading-relaxed">
                                                            These providers are in your area but do not meet our usual
                                                            recommendation criteria.
                                                        </p>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        {nearbyOnlyProviders!.map((p, i) => (
                                                            <ProviderCard
                                                                key={i}
                                                                provider={p}
                                                                index={providers.length + (emergingProviders?.length ?? 0) + i}
                                                                diagnosis={diagnosis}
                                                                conversationId={conversationId}
                                                                openPopoverId={openPopoverId}
                                                                setOpenPopoverId={setOpenPopoverId}
                                                                trade={trade}
                                                                userLocation={userLocation}
                                                            />
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        ))}
                    {hasImage &&
                        hasLocation &&
                        (providers.length > 0 || emergingProviders.length > 0 || (nearbyOnlyProviders?.length ?? 0) > 0) && (
                            <div className="mt-6 pt-4 border-t border-border">
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    Was this diagnosis accurate? Additional photos or details help
                                    us create a clearer report for your chosen provider and can
                                    speed up the job.
                                </p>
                            </div>
                        )}
                </div>
            )}
        </div>
    );
}
