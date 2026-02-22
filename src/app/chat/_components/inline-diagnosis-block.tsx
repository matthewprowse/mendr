'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { sanitizeAiContent } from '@/lib/utils';
import { DiagnosisData, Provider } from './types';
import { ProviderCard } from './provider-card';
import { ProvidersSkeleton } from './skeletons';

export function InlineDiagnosisBlock({
    conversationId,
    diagnosis,
    providers,
    isLoadingProviders,
    userLocation,
    trade,
    messageIndex,
    openPopoverId,
    setOpenPopoverId,
    onRequestLocation,
    onAddressSelect,
}: {
    conversationId?: string;
    diagnosis: DiagnosisData;
    providers?: Provider[];
    isLoadingProviders?: boolean;
    userLocation: { lat: number; lng: number; address?: string } | null;
    trade?: string;
    messageIndex?: number;
    openPopoverId: string | null;
    setOpenPopoverId: (id: string | null) => void;
    onRequestLocation?: (trade?: string) => void;
    onAddressSelect?: (loc: { lat: number; lng: number; address: string }) => void;
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
    const hasLocation =
        typeof userLocation?.lat === 'number' &&
        typeof userLocation?.lng === 'number' &&
        !isNaN(userLocation.lat) &&
        !isNaN(userLocation.lng);

    return (
        <div className="w-full space-y-6 animate-in fade-in duration-300">
            {diagnosis.diagnosis && !diagnosis.requires_clarification && (
                <div className="space-y-6">
                    <div className="mt-3 space-y-2">
                        <h1 className="text-xl font-semibold">{diagnosis.diagnosis}</h1>
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
                </div>
            )}

            {canShowProviders && (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                        {(hasLocation && userLocation?.address) ? (
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium truncate min-w-0">
                                    {userLocation.address}
                                </span>
                                {onAddressSelect && (
                                    <Popover open={addressPopoverOpen} onOpenChange={setAddressPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline">
                                                Change Location
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-96" align="start">
                                            <div className="flex flex-col gap-3">
                                                <p className="text-sm font-medium">Search for a different address</p>
                                                <Input
                                                    placeholder="Enter address or place"
                                                    value={addressQuery}
                                                    onChange={(e) => {
                                                        setAddressQuery(e.target.value);
                                                        setAddressError(null);
                                                    }}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddressSearch()}
                                                />
                                                {addressError && (
                                                    <p className="text-xs text-destructive">{addressError}</p>
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
                                )}
                            </div>
                        ) : (
                            onRequestLocation && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button size="sm" onClick={() => onRequestLocation(trade)}>
                                        Use my location
                                    </Button>
                                    {onAddressSelect && (
                                        <Popover open={addressPopoverOpen} onOpenChange={setAddressPopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" size="sm">
                                                    Search address
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-80" align="start">
                                                <div className="flex flex-col gap-3">
                                                    <p className="text-sm font-medium">Search for an address</p>
                                                    <Input
                                                        placeholder="Enter address or place"
                                                        value={addressQuery}
                                                        onChange={(e) => {
                                                            setAddressQuery(e.target.value);
                                                            setAddressError(null);
                                                        }}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleAddressSearch()}
                                                    />
                                                    {addressError && (
                                                        <p className="text-xs text-destructive">{addressError}</p>
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
                                    )}
                                </div>
                            )
                        )}
                    </div>
                    {(isLoadingProviders || !hasLocation) ? (
                        <ProvidersSkeleton />
                    ) : (providers?.length ?? 0) === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">
                            No providers found in your area.
                        </p>
                    ) : (
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
                                                            {sanitizeAiContent(favourite.favouriteReason)}
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
                                                        Was this diagnosis accurate? Additional photos or details help us create a clearer report for your chosen provider and can speed up the job.
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
                                    </>
                                );
                            })()}
                        </div>
                    )}
                    {(providers?.length ?? 0) > 0 && (
                        <div className="pt-4">
                            <p className="text-sm text-foreground leading-relaxed">
                                Was this diagnosis accurate? Additional photos or details help us create a clearer report for your chosen provider and can speed up the job.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
