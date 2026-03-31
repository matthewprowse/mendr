'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import type { DiagnosisData, Provider } from '@/app/chat/_components/types';
import { ProviderCard } from '@/app/chat/_components/provider-card';
import { ProvidersMap } from '@/app/chat/_components/providers-map';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from '@/lib/icons';
import { AppHeader } from '@/components/app-header';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';

type MatchPageClientProps = {
    conversationId: string;
};

type ConversationWithLocation = {
    id: string;
    diagnosis: DiagnosisData | null;
    customer_lat: number | null;
    customer_lng: number | null;
    customer_address: string | null;
    providers_payload: {
        providers?: Provider[] | null;
        emerging_providers?: Provider[] | null;
        nearby_only_providers?: Provider[] | null;
    } | null;
};

type MessageWithProviders = {
    diagnosis: DiagnosisData | null;
    providers: Provider[] | null;
    emerging_providers: Provider[] | null;
    nearby_only_providers: Provider[] | null;
};

export function MatchPageClient({ conversationId }: MatchPageClientProps) {
    const router = useRouter();
    const supabase = getSupabase();

    const storageKey = `matchProviders:${conversationId}`;

    const [loading, setLoading] = useState(true);
    const [conversation, setConversation] = useState<ConversationWithLocation | null>(null);
    const [providers, setProviders] = useState<Provider[]>([]);
    const [emergingProviders, setEmergingProviders] = useState<Provider[]>([]);
    const [nearbyOnlyProviders, setNearbyOnlyProviders] = useState<Provider[]>([]);
    const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
    const [loadingProviders, setLoadingProviders] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);

    const persistProviders = useCallback(() => {
        if (typeof window === 'undefined') return;
        const hasAnyProviders =
            providers.length > 0 ||
            emergingProviders.length > 0 ||
            nearbyOnlyProviders.length > 0;
        if (!hasAnyProviders) {
            window.localStorage.removeItem(storageKey);
            return;
        }
        try {
            const payload = {
                providers,
                emergingProviders,
                nearbyOnlyProviders,
                activeIndex,
            };
            window.localStorage.setItem(storageKey, JSON.stringify(payload));
        } catch {
            // Ignore storage failures – matching should still work without persistence.
        }
    }, [
        activeIndex,
        emergingProviders,
        nearbyOnlyProviders,
        providers,
        storageKey,
    ]);

    // Add this conversation to "my reports" so the pro page can offer "Send report via WhatsApp".
    useEffect(() => {
        if (typeof window === 'undefined' || !conversationId?.trim()) return;
        try {
            const key = 'scandio_my_reports';
            const raw = window.localStorage.getItem(key);
            const list: Array<{ conversationId: string; title: string; date: string }> = raw
                ? JSON.parse(raw)
                : [];
            if (!list.some((r) => r.conversationId === conversationId)) {
                list.unshift({
                    conversationId,
                    title: `Report ${new Date().toLocaleDateString()}`,
                    date: new Date().toISOString(),
                });
                window.localStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
            }
        } catch {
            // Ignore
        }
    }, [conversationId]);

    const handleFindProviders = useCallback(async () => {
        const diag = conversation?.diagnosis;
        if (!diag || !diag.trade || diag.trade === 'N/A') {
            toast.error('We need a valid trade from your diagnosis to find providers.');
            return;
        }
        setLoadingProviders(true);
        try {
            let lat = conversation?.customer_lat ?? null;
            let lng = conversation?.customer_lng ?? null;

            if (
                typeof lat !== 'number' ||
                typeof lng !== 'number' ||
                Number.isNaN(lat) ||
                Number.isNaN(lng)
            ) {
                if (typeof window === 'undefined' || !navigator.geolocation) {
                    toast.error(
                        'Location is not available in your browser. Please try on a device with location enabled.'
                    );
                    setLoadingProviders(false);
                    return;
                }

                await new Promise<void>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            lat = pos.coords.latitude;
                            lng = pos.coords.longitude;
                            resolve();
                        },
                        (err) => {
                            if (err.code === 1) {
                                toast.error(
                                    'Location access was denied. Please enable it in your browser settings and try again.'
                                );
                            } else {
                                toast.error('Could not get your location. Please try again.');
                            }
                            reject(err);
                        },
                        { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 }
                    );
                });

                // Persist location back to the conversation for future visits.
                if (typeof lat === 'number' && typeof lng === 'number') {
                    void supabase
                        .from('conversations')
                        .update({ customer_lat: lat, customer_lng: lng })
                        .eq('id', conversationId);
                }
            }

            if (
                typeof lat !== 'number' ||
                typeof lng !== 'number' ||
                Number.isNaN(lat) ||
                Number.isNaN(lng)
            ) {
                setLoadingProviders(false);
                return;
            }

            const radiusKm = 25;
            const res = await fetch('/api/providers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lat,
                    lng,
                    trade: diag.trade,
                    radius: radiusKm * 1000,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || "Couldn't load providers. Please try again.");
                setLoadingProviders(false);
                return;
            }
            const finalProviders: Provider[] = ((data.providers as Provider[]) ?? []) || [];
            const finalEmerging: Provider[] =
                ((data.emergingProviders as Provider[]) ?? []) || [];
            const finalNearbyOnly: Provider[] =
                ((data.nearbyOnlyProviders as Provider[]) ?? []) || [];

            setProviders(finalProviders);
            setEmergingProviders(finalEmerging);
            setNearbyOnlyProviders(finalNearbyOnly);

            // Persist providers to Supabase so future visits to this match
            // can hydrate from the backend instead of re-running the search.
            try {
                await (supabase as any)
                    .from('conversations')
                    .update({
                        providers: {
                            providers: finalProviders,
                            emerging_providers: finalEmerging,
                            nearby_only_providers: finalNearbyOnly,
                        },
                    })
                    .eq('id', conversationId);
            } catch {
                // If this fails, we still have providers in memory; caching is best-effort.
            }
        } catch (e) {
            if (process.env.NODE_ENV === 'development') {
                // eslint-disable-next-line no-console
                console.error('[MatchPage] handleFindProviders error', e);
            }
            toast.error("Couldn't load providers. Please try again.");
        } finally {
            setLoadingProviders(false);
        }
    }, [conversation, conversationId, supabase]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const [{ data: conv }, { data: msgs }] = await Promise.all([
                    supabase
                        .from('conversations')
                        .select(
                            'id,diagnosis,customer_lat,customer_lng,customer_address,providers'
                        )
                        .eq('id', conversationId)
                        .maybeSingle(),
                    supabase
                        .from('messages')
                        .select('diagnosis,providers,emerging_providers,nearby_only_providers')
                        .eq('conversation_id', conversationId)
                        .order('created_at', { ascending: true }),
                ]);

                if (cancelled) return;

                if (!conv) {
                    router.replace('/welcome');
                    return;
                }

                const convRow: ConversationWithLocation = {
                    id: conv.id,
                    diagnosis: (conv as any).diagnosis ?? null,
                    customer_lat: (conv as any).customer_lat ?? null,
                    customer_lng: (conv as any).customer_lng ?? null,
                    customer_address: (conv as any).customer_address ?? null,
                    providers_payload: ((conv as any).providers as ConversationWithLocation['providers_payload']) ?? null,
                };

                setConversation(convRow);

                const typedMsgs = (msgs ?? []) as MessageWithProviders[];
                const lastWithProviders =
                    [...typedMsgs]
                        .reverse()
                        .find(
                            (m) =>
                                m.diagnosis &&
                                ((m.providers && m.providers.length > 0) ||
                                    (m.emerging_providers && m.emerging_providers.length > 0) ||
                                    (m.nearby_only_providers &&
                                        m.nearby_only_providers.length > 0))
                        ) || null;

                if (lastWithProviders) {
                    const fromMsgProviders = (lastWithProviders.providers as Provider[]) || [];
                    const fromMsgEmerging =
                        (lastWithProviders.emerging_providers as Provider[]) || [];
                    const fromMsgNearby =
                        (lastWithProviders.nearby_only_providers as Provider[]) || [];

                    setProviders(fromMsgProviders);
                    setEmergingProviders(fromMsgEmerging);
                    setNearbyOnlyProviders(fromMsgNearby);

                    // Best-effort: persist message-level providers snapshot onto
                    // the parent conversation so future visits to /match/[id]
                    // can hydrate from conversations.providers without needing
                    // to scan messages or hit the providers API again.
                    try {
                        await (supabase as any)
                            .from('conversations')
                            .update({
                                providers: {
                                    providers: fromMsgProviders,
                                    emerging_providers: fromMsgEmerging,
                                    nearby_only_providers: fromMsgNearby,
                                },
                            })
                            .eq('id', conversationId);
                    } catch {
                        // Ignore caching failures; core UX should still work.
                    }
                } else if (convRow.providers_payload) {
                    const payload = convRow.providers_payload;
                    if (Array.isArray(payload.providers)) {
                        setProviders(payload.providers);
                    }
                    if (Array.isArray(payload.emerging_providers)) {
                        setEmergingProviders(payload.emerging_providers);
                    }
                    if (Array.isArray(payload.nearby_only_providers)) {
                        setNearbyOnlyProviders(payload.nearby_only_providers);
                    }
                } else if (typeof window !== 'undefined') {
                    try {
                        const raw = window.localStorage.getItem(storageKey);
                        if (raw) {
                            const parsed = JSON.parse(raw) as {
                                providers?: Provider[];
                                emergingProviders?: Provider[];
                                nearbyOnlyProviders?: Provider[];
                                activeIndex?: number;
                            };
                            if (Array.isArray(parsed.providers)) {
                                setProviders(parsed.providers);
                            }
                            if (Array.isArray(parsed.emergingProviders)) {
                                setEmergingProviders(parsed.emergingProviders);
                            }
                            if (Array.isArray(parsed.nearbyOnlyProviders)) {
                                setNearbyOnlyProviders(parsed.nearbyOnlyProviders);
                            }
                            if (
                                typeof parsed.activeIndex === 'number' &&
                                parsed.activeIndex >= 0
                            ) {
                                setActiveIndex(parsed.activeIndex);
                            }
                        }
                    } catch {
                        // Ignore invalid or inaccessible storage payloads.
                    }
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [conversationId, router, storageKey, supabase]);

    useEffect(() => {
        if (!conversation) return;
        persistProviders();
    }, [
        activeIndex,
        conversation,
        emergingProviders.length,
        nearbyOnlyProviders.length,
        persistProviders,
        providers.length,
    ]);

    useEffect(() => {
        if (loading) return;
        if (!conversation) return;
        const hasAnyProviders =
            providers.length > 0 || emergingProviders.length > 0 || nearbyOnlyProviders.length > 0;
        if (hasAnyProviders) return;
        if (loadingProviders) return;
        void handleFindProviders();
    }, [
        conversation,
        handleFindProviders,
        loading,
        loadingProviders,
        providers.length,
        emergingProviders.length,
        nearbyOnlyProviders.length,
    ]);

    if (loading && !conversation) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                    <p className="text-sm text-muted-foreground">Loading your matches…</p>
                </div>
            </main>
        );
    }

    if (!conversation) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-background">
                <div className="space-y-3 text-center">
                    <p className="text-sm font-medium text-foreground">
                        We couldn&apos;t find this match.
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Please start again from the welcome step.
                    </p>
                    <Button size="sm" onClick={() => router.push('/welcome')}>
                        Back to welcome
                    </Button>
                </div>
            </main>
        );
    }

    const userLocation =
        typeof conversation.customer_lat === 'number' &&
        typeof conversation.customer_lng === 'number' &&
        !Number.isNaN(conversation.customer_lat) &&
        !Number.isNaN(conversation.customer_lng)
            ? {
                  lat: conversation.customer_lat,
                  lng: conversation.customer_lng,
              }
            : null;

    const primaryDiagnosis = conversation.diagnosis;

    const allProviders = [
        ...providers,
        ...emergingProviders,
        ...nearbyOnlyProviders,
    ] as Provider[];

    const currentProvider =
        allProviders.length > 0 && activeIndex >= 0 && activeIndex < allProviders.length
            ? allProviders[activeIndex]
            : allProviders[0] ?? null;

    const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

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
                    {primaryDiagnosis?.diagnosis && (
                        <p className="text-sm text-muted-foreground">
                            Based on your diagnosis of{' '}
                            <span className="font-medium text-foreground">
                                {primaryDiagnosis.diagnosis}
                            </span>
                            , here are nearby providers that look like a good fit.
                        </p>
                    )}
                </header>

                <Separator />

                {allProviders.length === 0 ? (
                    <section className="rounded-lg border border-dashed border-border bg-muted/40 p-4 space-y-3">
                        <p className="text-sm text-muted-foreground">
                            We haven&apos;t loaded providers for this diagnosis yet.
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleFindProviders}
                                disabled={loadingProviders}
                            >
                                {loadingProviders ? 'Finding providers…' : 'Find providers near me'}
                            </Button>
                            {!userLocation && (
                                <p className="text-xs text-muted-foreground">
                                    We&apos;ll ask for your location to search for trusted providers
                                    in your area.
                                </p>
                            )}
                        </div>
                    </section>
                ) : (
                    <>
                        <section className="space-y-6">
                            <div className="space-y-2">
                                <Label className="text-base text-foreground font-medium">
                                    Recommended providers
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    Use the arrows below to compare providers. Tap a card to view
                                    contact options or send a WhatsApp summary.
                                </p>
                            </div>
                            {currentProvider && (
                                <div className="space-y-4">
                                    <ProviderCard
                                        provider={currentProvider}
                                        index={activeIndex}
                                        diagnosis={primaryDiagnosis}
                                        conversationId={conversationId}
                                        openPopoverId={openPopoverId}
                                        setOpenPopoverId={setOpenPopoverId}
                                        trade={primaryDiagnosis?.trade}
                                        userLocation={userLocation}
                                    />
                                    {allProviders.length > 1 && (
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
                                                            (activeIndex - 1 + allProviders.length) %
                                                                allProviders.length
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
                                                        setActiveIndex(
                                                            (activeIndex + 1) % allProviders.length
                                                        )
                                                    }
                                                >
                                                    <ArrowRight className="size-4" />
                                                </Button>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {allProviders.map((_, i) => (
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

                        {allProviders.length > 0 && mapsApiKey && currentProvider && (
                            <section className="space-y-3">
                                <Label className="text-base text-foreground font-medium">
                                    Map
                                </Label>
                                <div className="w-full max-w-full overflow-hidden rounded-lg border border-input/50 bg-background">
                                    <ProvidersMap
                                        apiKey={mapsApiKey}
                                        providers={allProviders}
                                        emergingProviders={[]}
                                        nearbyOnlyProviders={[]}
                                        userLocation={userLocation}
                                        conversationId={conversation.id}
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
                                            <Button
                                                asChild
                                                type="button"
                                                className="w-full"
                                            >
                                                <a
                                                    href={
                                                        (() => {
                                                            const origin = userLocation
                                                                ? `${userLocation.lat},${userLocation.lng}`
                                                                : encodeURIComponent(
                                                                      conversation.customer_address ||
                                                                          ''
                                                                  );
                                                            const hasCoords =
                                                                typeof currentProvider.latitude ===
                                                                    'number' &&
                                                                typeof currentProvider.longitude ===
                                                                    'number';
                                                            const destination = hasCoords
                                                                ? `${currentProvider.latitude},${currentProvider.longitude}`
                                                                : encodeURIComponent(
                                                                      currentProvider.address || ''
                                                                  );
                                                            const params = new URLSearchParams({
                                                                api: '1',
                                                                destination,
                                                                travelmode: 'driving',
                                                            });
                                                            if (origin) {
                                                                params.set('origin', origin);
                                                            }
                                                            return `https://www.google.com/maps/dir/?${params.toString()}`;
                                                        })()
                                                    }
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
                    </>
                )}
            </div>
        </main>
    );
}

