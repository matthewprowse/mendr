'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { sanitizeAiContent } from '@/lib/utils';
import { DiagnosisData, Provider } from './types';
import { ProviderCard } from './provider-card';
import { ProvidersSkeleton } from './skeletons';

const WORD_DELAY_MS = 40;

function RevealText({ text }: { text: string }) {
    const words = text.trim() ? text.trim().split(/\s+/) : [];
    const [visibleCount, setVisibleCount] = useState(0);

    useEffect(() => {
        setVisibleCount(0);
    }, [text]);

    useEffect(() => {
        if (visibleCount >= words.length) return;
        const t = setTimeout(() => setVisibleCount((c) => c + 1), WORD_DELAY_MS);
        return () => clearTimeout(t);
    }, [visibleCount, words.length]);

    const visible = words.slice(0, visibleCount).join(' ');
    const trailingSpace = visibleCount > 0 && visibleCount < words.length ? ' ' : '';
    return <>{visible}{trailingSpace}</>;
}

export function DiagnosisResponseCard({
    conversationId,
    diagnosis,
    providers,
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
}: {
    conversationId?: string;
    diagnosis: DiagnosisData;
    providers: Provider[];
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
        <div className="w-full">

            {diagnosis.diagnosis && !diagnosis.requires_clarification && (
                <>
                    <div className="space-y-4">
                        <h3 className="text-xl font-semibold">{diagnosis.diagnosis}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                            {sanitizeAiContent(diagnosis.action_required || '')}
                        </p>
                        {diagnosis.estimated_cost && diagnosis.estimated_cost !== 'N/A' && (
                            <p className="text-sm font-medium text-foreground leading-relaxed whitespace-pre-wrap">
                                {sanitizeAiContent(diagnosis.estimated_cost)}
                            </p>
                        )}
                    </div>
                    {canShowProviders && diagnosisConfirmed === null && onConfirmYes && onConfirmNo && (
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
                <div className="mt-8 flex flex-col gap-4">
                    <Separator className="w-full mb-3" />
                    <div>
                        <h4 className="text-lg font-semibold text-foreground">Recommended Service Providers</h4>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                            We’ve selected top-rated {trade?.toLowerCase() || 'service'} specialists near you based on reviews and distance.
                            You can use your current location or search for a different address below.
                        </p>
                    </div>
                    <div className="flex flex-col gap-3 mb-2">
                        {(hasLocation && userLocation?.address) ? (
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm text-muted-foreground truncate min-w-0">
                                    {userLocation.address}
                                </span>
                                <Popover open={addressPopoverOpen} onOpenChange={setAddressPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" className="shrink-0">
                                            Change Location
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-96" align="start">
                                        <div className="flex flex-col gap-3">
                                            <p className="text-sm font-medium">Search Address</p>
                                            <Input
                                                placeholder="Enter Address or Place"
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
                            <div className="flex flex-col items-start gap-2">
                                <p className="text-sm text-muted-foreground">
                                    Use your current location or search for an address to find providers nearby.
                                </p>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button onClick={() => onRequestLocation(trade)}>Use my location</Button>
                                    <Popover open={addressPopoverOpen} onOpenChange={setAddressPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline">Search address</Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-80" align="start">
                                            <div className="flex flex-col gap-3">
                                                <p className="text-sm font-medium">Search Address</p>
                                                <Input
                                                    placeholder="Enter Address or Place"
                                                    value={addressQuery}
                                                    onChange={(e) => {
                                                        setAddressQuery(e.target.value);
                                                        setAddressError(null);
                                                    }}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddressSearch()}
                                                    className="rounded-lg"
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
                                </div>
                            </div>
                        )}
                    </div>
                    {hasLocation &&
                        (isLoadingProviders ? (
                            <ProvidersSkeleton />
                        ) : providers.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-2">No providers found in your area.</p>
                        ) : (
                            <div className="flex flex-col gap-6">
                                {(() => {
                                    const favourite = providers.find((p) => p.isFavourite);
                                    const others = providers.filter((p) => !p.isFavourite);
                                    return (
                                        <>
                                            {favourite && (
                                                <div className="flex flex-col gap-3">
                                                    <h4 className="text-base font-semibold text-foreground">
                                                        Scandio&apos;s Pick
                                                    </h4>
                                                    {favourite.favouriteReason && (
                                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                                            {sanitizeAiContent(favourite.favouriteReason)}
                                                        </p>
                                                    )}
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
                                                    <h4 className="text-base font-semibold text-foreground">
                                                        More options
                                                    </h4>
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
                        ))}
                    {hasLocation && providers.length > 0 && (
                        <div className="mt-6 pt-4 border-t border-border">
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Was this diagnosis accurate? Additional photos or details help us create a clearer report for your chosen provider and can speed up the job.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
