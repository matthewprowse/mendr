'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import type { DiagnosisData, Provider } from '@/app/chat/components/types';
import { ProviderCard } from '@/app/chat/components/provider-card';
import { ProvidersMap } from '@/app/chat/components/providers-map';
import { Button } from '@/components/ui/button';
import { ArrowLeft as ArrowLeftGeist, ArrowRight } from '@/lib/icons';
import { ArrowLeft } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

const PAGE_BG = '#FBFAF7';
const INK = '#16120E';

const backArrowHitClass =
    'inline-flex size-8 shrink-0 items-center justify-center rounded-md touch-manipulation text-[#16120E] transition-opacity hover:opacity-70 active:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/15 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FBFAF7]';

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
                        .from('diagnoses')
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
                    .from('diagnoses')
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
                        .from('diagnoses')
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
                    router.replace('/start');
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
                            .from('diagnoses')
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

    const userLocation =
        typeof conversation?.customer_lat === 'number' &&
        typeof conversation?.customer_lng === 'number' &&
        !Number.isNaN(conversation.customer_lat) &&
        !Number.isNaN(conversation.customer_lng)
            ? { lat: conversation.customer_lat, lng: conversation.customer_lng }
            : null;

    const primaryDiagnosis = conversation?.diagnosis ?? null;

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

    // ── Loading / not-found shells ─────────────────────────────────────────────

    if (loading && !conversation) {
        return (
            <div className="h-dvh overflow-hidden flex flex-col" style={{ background: PAGE_BG }}>
                <div className="shrink-0 flex items-center justify-between px-6 pt-6 pb-2">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        aria-label="Go back"
                        className={backArrowHitClass}
                    >
                        <ArrowLeft size={20} weight="bold" aria-hidden />
                    </button>
                    <span className="text-sm font-semibold" style={{ color: INK }}>Scandio</span>
                    <span className="size-8 shrink-0" aria-hidden />
                </div>
                <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
                    <div className="h-7 w-7 animate-spin rounded-full border-2 border-black/20 border-t-black/60" />
                    <p className="text-sm text-muted-foreground">Finding your matches\u2026</p>
                </div>
            </div>
        );
    }

    if (!conversation) {
        return (
            <div className="h-dvh overflow-hidden flex flex-col" style={{ background: PAGE_BG }}>
                <div className="shrink-0 flex items-center justify-between px-6 pt-6 pb-2">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        aria-label="Go back"
                        className={backArrowHitClass}
                    >
                        <ArrowLeft size={20} weight="bold" aria-hidden />
                    </button>
                    <span className="text-sm font-semibold" style={{ color: INK }}>Scandio</span>
                    <span className="size-8 shrink-0" aria-hidden />
                </div>
                <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
                    <p className="text-sm font-medium" style={{ color: INK }}>
                        We couldn&apos;t find this match.
                    </p>
                    <Button size="sm" className="h-10" onClick={() => router.push('/start')}>
                        Start New Diagnosis
                    </Button>
                </div>
            </div>
        );
    }

    // ── Main page ──────────────────────────────────────────────────────────────

    return (
        <div className="h-dvh overflow-hidden flex flex-col" style={{ background: PAGE_BG }}>
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-6 pt-6 pb-2">
                <button
                    type="button"
                    onClick={() => router.back()}
                    aria-label="Go back"
                    className={backArrowHitClass}
                >
                    <ArrowLeft size={20} weight="bold" aria-hidden />
                </button>
                <span
                    className="min-w-0 flex-1 truncate px-2 text-center text-sm font-semibold"
                    style={{ color: INK }}
                >
                    Scandio
                </span>
                <span className="size-8 shrink-0" aria-hidden />
            </div>

            {/* Scrollable content */}
            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-8">

                    {/* Page heading */}
                    <div className="flex flex-col gap-1">
                        <h1 className="text-2xl font-semibold leading-snug" style={{ color: INK }}>
                            Provider Matches
                        </h1>
                        {primaryDiagnosis?.diagnosis && (
                            <p className="text-sm leading-relaxed text-muted-foreground">
                                Based on:{' '}
                                <span className="font-medium" style={{ color: INK }}>
                                    {primaryDiagnosis.diagnosis}
                                </span>
                            </p>
                        )}
                    </div>

                    {/* Empty / loading state */}
                    {allProviders.length === 0 ? (
                        <div className="flex flex-col gap-4">
                            {loadingProviders ? (
                                <div className="flex flex-col gap-3">
                                    <Skeleton className="h-36 w-full rounded-3xl" />
                                    <Skeleton className="h-36 w-full rounded-3xl" />
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4 rounded-3xl border border-black/[0.07] bg-white p-6 shadow-sm">
                                    <p className="text-sm text-muted-foreground">
                                        We haven&apos;t loaded providers for this diagnosis yet.
                                    </p>
                                    <Button
                                        type="button"
                                        className="h-10 w-full"
                                        onClick={() => void handleFindProviders()}
                                        disabled={loadingProviders}
                                    >
                                        Find Providers Near Me
                                    </Button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Provider card + pagination */}
                            <div className="flex flex-col gap-4">
                                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Recommended providers
                                </span>
                                {currentProvider && (
                                    <div className="flex flex-col gap-3">
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
                                                    <button
                                                        type="button"
                                                        aria-label="Previous provider"
                                                        className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.06] active:bg-black/10 disabled:opacity-40"
                                                        onClick={() =>
                                                            setActiveIndex(
                                                                (activeIndex - 1 + allProviders.length) %
                                                                    allProviders.length
                                                            )
                                                        }
                                                    >
                                                        <ArrowLeftGeist className="size-4" style={{ color: INK }} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        aria-label="Next provider"
                                                        className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.06] active:bg-black/10 disabled:opacity-40"
                                                        onClick={() =>
                                                            setActiveIndex(
                                                                (activeIndex + 1) % allProviders.length
                                                            )
                                                        }
                                                    >
                                                        <ArrowRight className="size-4" style={{ color: INK }} />
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    {allProviders.map((_, i) => (
                                                        <button
                                                            key={i}
                                                            type="button"
                                                            onClick={() => setActiveIndex(i)}
                                                            aria-label={`Go to provider ${i + 1}`}
                                                            className={`h-1.5 rounded-full transition-all duration-300 ${
                                                                i === activeIndex
                                                                    ? 'w-5 bg-foreground'
                                                                    : 'w-1.5 bg-foreground/20'
                                                            }`}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Map */}
                            {mapsApiKey && currentProvider && (
                                <div className="flex flex-col gap-3">
                                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Map
                                    </span>
                                    <div className="w-full overflow-hidden rounded-3xl border border-black/[0.07] bg-white shadow-sm">
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
                                        <div className="border-t border-black/[0.06] px-5 py-4 flex flex-col gap-2">
                                            <p className="text-sm font-semibold" style={{ color: INK }}>
                                                {currentProvider.name}
                                            </p>
                                            {currentProvider.address && (
                                                <p className="text-xs text-muted-foreground">
                                                    {currentProvider.address}
                                                </p>
                                            )}
                                            <Button
                                                asChild
                                                type="button"
                                                className="mt-1 h-10 w-full"
                                            >
                                                <a
                                                    href={(() => {
                                                        const origin = userLocation
                                                            ? `${userLocation.lat},${userLocation.lng}`
                                                            : encodeURIComponent(conversation.customer_address || '');
                                                        const hasCoords =
                                                            typeof currentProvider.latitude === 'number' &&
                                                            typeof currentProvider.longitude === 'number';
                                                        const destination = hasCoords
                                                            ? `${currentProvider.latitude},${currentProvider.longitude}`
                                                            : encodeURIComponent(currentProvider.address || '');
                                                        const params = new URLSearchParams({ api: '1', destination, travelmode: 'driving' });
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
                            )}
                        </>
                    )}

                </div>
            </div>
        </div>
    );
}

