'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { sanitizeAiContent } from '@/lib/utils';
import { toTitleCase } from '@/lib/services';
import { DiagnosisData, Provider } from './types';
import { ProviderCard } from './provider-card';
import { ServiceTradeLink } from './service-trade-link';
import { ProvidersSkeleton } from './skeletons';
import { ReportCard } from './report-card';

export function InlineDiagnosisBlock({
    conversationId,
    diagnosis,
    providers,
    emergingProviders,
    nearbyOnlyProviders,
    isLoadingProviders,
    userLocation,
    trade,
    messageIndex,
    openPopoverId,
    setOpenPopoverId,
    onRequestLocation,
    onAddressSelect,
    providerRadiusKm = 25,
    onRadiusChange,
}: {
    conversationId?: string;
    diagnosis: DiagnosisData;
    providers?: Provider[];
    emergingProviders?: Provider[];
    nearbyOnlyProviders?: Provider[];
    isLoadingProviders?: boolean;
    userLocation: { lat: number; lng: number; address?: string } | null;
    trade?: string;
    messageIndex?: number;
    openPopoverId: string | null;
    setOpenPopoverId: (id: string | null) => void;
    onRequestLocation?: (trade?: string) => void;
    onAddressSelect?: (loc: { lat: number; lng: number; address: string }) => void;
    providerRadiusKm?: number;
    onRadiusChange?: (km: number) => void;
}) {
    const [addressPopoverOpen, setAddressPopoverOpen] = useState(false);
    const [addressQuery, setAddressQuery] = useState('');
    const [addressSearching, setAddressSearching] = useState(false);
    const [addressError, setAddressError] = useState<string | null>(null);

    const handleAddressSearch = async () => {
        const q = addressQuery.trim();
        if (!q || !onAddressSelect) return;
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
    const isUnrelated = diagnosis.rejected || diagnosis.requires_clarification;
    const confidence = diagnosis.confidence ?? 100;
    const canShowProviders = !isUnrelated && trade && trade !== 'N/A' && confidence >= 85;
    const hasProvidersOrLoading =
        (providers?.length ?? 0) > 0 ||
        (emergingProviders?.length ?? 0) > 0 ||
        (nearbyOnlyProviders?.length ?? 0) > 0 ||
        isLoadingProviders;
    const hasDiagnosisToShow = diagnosis?.diagnosis && !isUnrelated;
    const showProvidersSection = hasDiagnosisToShow;
    const hasLocation =
        typeof userLocation?.lat === 'number' &&
        typeof userLocation?.lng === 'number' &&
        !isNaN(userLocation.lat) &&
        !isNaN(userLocation.lng);

    return (
        <div className="w-full max-w-full min-w-0 space-y-6 animate-in fade-in duration-300 overflow-hidden">
            {diagnosis.diagnosis && !diagnosis.requires_clarification && (
                <div className="space-y-6">
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
                </div>
            )}

            {showProvidersSection && (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                        {hasLocation && userLocation?.address ? (
                            <>
                                <div className="flex items-center gap-2 min-w-0 max-w-full overflow-hidden">
                                    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium" title={userLocation.address}>
                                        {userLocation.address}
                                    </span>
                                    {onAddressSelect && (
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
                                                        Search Locations (Western Cape only)
                                                    </p>
                                                    <Input
                                                        placeholder="Enter address in Western Cape, South Africa"
                                                        className="text-[14px] sm:text-sm"
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
                                    )}
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
                        ) : (
                            onRequestLocation && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button size="sm" onClick={() => onRequestLocation(trade)}>
                                        Use my location
                                    </Button>
                                    {onAddressSelect && (
                                        <Popover
                                            open={addressPopoverOpen}
                                            onOpenChange={setAddressPopoverOpen}
                                        >
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" size="sm">
                                                    Search address
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-80" align="start">
                                                <div className="flex flex-col gap-3">
                                                    <p className="text-sm font-semibold">
                                                        Search for an address
                                                    </p>
                                                    <Input
                                                        placeholder="Enter address or place"
                                                        className="text-[14px] sm:text-sm"
                                                        value={addressQuery}
                                                        onChange={(e) => {
                                                            setAddressQuery(e.target.value);
                                                            setAddressError(null);
                                                        }}
                                                        onKeyDown={(e) =>
                                                            e.key === 'Enter' &&
                                                            handleAddressSearch()
                                                        }
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
                                    )}
                                </div>
                            )
                        )}
                    </div>
                    {(() => {
                        // Stored providers (e.g. from DB when reopening) are arrays; treat any array as "we have result".
                        const hasResult =
                            (Array.isArray(providers) && providers.length > 0) ||
                            (Array.isArray(emergingProviders) && (emergingProviders?.length ?? 0) > 0) ||
                            (Array.isArray(nearbyOnlyProviders) && (nearbyOnlyProviders?.length ?? 0) > 0) ||
                            providers !== undefined ||
                            emergingProviders !== undefined ||
                            nearbyOnlyProviders !== undefined;
                        const allEmpty =
                            (providers?.length ?? 0) === 0 &&
                            (emergingProviders?.length ?? 0) === 0 &&
                            (nearbyOnlyProviders?.length ?? 0) === 0;
                        // Only show skeleton when actively loading. When reopening, stored providers are passed in and must render.
                        const showSkeleton = isLoadingProviders;
                        if (showSkeleton) {
                            return (
                                <div className="flex flex-col gap-3">
                                    <p className="text-sm text-muted-foreground">
                                        Finding providers…
                                    </p>
                                    <ProvidersSkeleton />
                                </div>
                            );
                        }
                        if (hasResult && allEmpty) {
                            return (
                                <p className="text-sm text-muted-foreground py-2">
                                    No providers found in your area.
                                </p>
                            );
                        }
                        return (
                        <div className="flex flex-col gap-6">
                            {(() => {
                                const list = providers ?? [];
                                const favourite = list.find((p) => p.isFavourite);
                                const others = list.filter((p) => !p.isFavourite);
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
                                        {(emergingProviders?.length ?? 0) > 0 && (
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
                                                    {emergingProviders!.map((p, i) => (
                                                        <ProviderCard
                                                            key={i}
                                                            provider={p}
                                                            index={(providers?.length ?? 0) + i}
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
                                            ((providers?.length ?? 0) + (emergingProviders?.length ?? 0)) < 6 && (
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
                                                            index={(providers?.length ?? 0) + (emergingProviders?.length ?? 0) + i}
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
                        );
                    })()}
                    {(providers?.length ?? 0) > 0 && conversationId && (
                        <div className="pt-2">
                            <ReportCard conversationId={conversationId} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
