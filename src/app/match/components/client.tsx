'use client';
/* eslint-disable no-console */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { setLastConversationIdForWhatsApp } from '@/lib/whatsapp-prefill';
import { HomeownerAuthDialog } from '@/components/homeowner-auth-dialog';
import { ContactConsentDialog } from '@/components/contact-consent-dialog';
import { MatchResultsLayout } from '@/app/match/components/match-map-sheet-layout';
import { ProviderCard } from '@/app/match/components/provider-card';
import dynamic from 'next/dynamic';

// FilterSheet contains shadcn Sheet + heavy filter logic — load it on first open, not on page load.
const FilterSheet = dynamic(
    () => import('@/app/match/components/filter-sheet').then((m) => ({ default: m.FilterSheet })),
    { ssr: false },
);
import {
    applyFilters as applyMatchFilters,
    compareForSort,
    DEFAULT_FILTER_STATE,
    type MatchFilterState,
} from '@/features/match/hooks/use-match-filters';
import type { MatchProvider } from '@/features/match/contracts';
import {
    queueEnrichmentApi,
    restoreProviderTokenApi,
} from '@/features/match/api/client';
import { useMatchConversationContext } from '@/features/match/hooks/use-match-conversation-context';
import { useMatchProviders } from '@/features/match/hooks/use-match-providers';
import { loadMatchPageCache, saveMatchPageCache } from '@/features/match/cache/match-page-cache';
import { MatchNoProvidersEmpty } from '@/app/match/components/empty';
import { fetchConversationDiagnosis } from '@/lib/diagnosis/diagnoses-api';
import { buildDiagnosisVersion } from '@/features/diagnosis/processing-orchestrator';
import {
    DEFAULT_SEARCH_RADIUS_METERS,
    EXTENDED_SEARCH_RADIUS_METERS,
    enrichmentEntryForProvider,
    formatCustomerSummary,
    matchCardEnrichmentResolved,
    providerPriorityScore,
    totalReviewCountForProvider,
} from '@/app/match/components/enrichment-utils';
import {
    useEnrichmentQueueAndPoll,
    useEnrichmentState,
    useMendrReviewCountFetch,
} from '@/app/match/components/use-enrichment-polling';
import { useMatchFilterUrlState } from '@/app/match/components/use-match-filter-state';
import { useLocationSearch } from '@/app/match/components/use-location-search';
import { useContactFlowState } from '@/app/match/components/use-contact-flow';
import {
    beginContact as beginContactAction,
    confirmConsentAndContact,
    type ContactChannel,
} from '@/app/match/components/contact-actions';
import { ContactPopover } from '@/app/match/components/contact-popover';
import { AddressSearchField } from '@/app/match/components/address-search-field';
import { MatchFilteredEmpty, MatchListSkeleton } from '@/app/match/components/match-list-states';

export function MatchClient({ conversationId: initialConversationId }: { conversationId?: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const pathConversationId = useMemo(() => {
        const raw = (pathname || '').split('/').filter(Boolean).pop() || '';
        if (!raw || raw.toLowerCase() === 'match') return '';
        return decodeURIComponent(raw);
    }, [pathname]);
    const conversationId =
        initialConversationId ||
        searchParams.get('conversationId') ||
        pathConversationId ||
        '';

    useEffect(() => {
        if (conversationId) setLastConversationIdForWhatsApp(conversationId);
    }, [conversationId]);

    const [isLoading, setIsLoading] = useState(true);
    const {
        userLocation,
        setUserLocation,
        addressInput,
        setAddressInput,
        resolveTradeContext,
        ensureLocation,
        getCurrentCoordinates,
        persistConversationLocation,
    } = useMatchConversationContext(conversationId);
    const {
        providers,
        setProviders,
        companyIndex,
        setCompanyIndex,
        isProvidersLoading,
        refreshProvidersForLocation,
        providersFromViewportCache,
    } = useMatchProviders({
        resolveTradeContext,
        conversationId,
    });
    // Contact gate (Phase 2): logged-in + captured number + consent before any
    // WhatsApp/Call/Email action. The lead and shared identity are written at
    // the moment of consent, before any message is sent.
    const {
        contactOpen,
        setContactOpen,
        user,
        authOpen,
        setAuthOpen,
        consentOpen,
        setConsentOpen,
        contactBusy,
        setContactBusy,
        consentMode,
        setConsentMode,
        pendingContact,
        setPendingContact,
    } = useContactFlowState();
    const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
    const [isLocatingUser, setIsLocatingUser] = useState(false);
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

    /**
     * URL-synced filter state. We push updates back to the URL via `router.replace` so back/forward
     * works as users tweak filters; we keep the existing `conversationId` query param when present.
     */
    const { filterState, setFilterState, resetFilters, activeFilterCount } = useMatchFilterUrlState({
        conversationId,
        pathname,
        searchParams,
    });
    // Deduplicate provider_contact analytics per provider per session.
    const providerContactFiredForProviderIdRef = useRef<string | null>(null);
    const [searchRadiusMeters, setSearchRadiusMeters] = useState(DEFAULT_SEARCH_RADIUS_METERS);
    const [cachedDiagnosisVersion, setCachedDiagnosisVersion] = useState<string | undefined>(undefined);
    const lastProviderFetchKeyRef = useRef('');

    /**
     * Sort the full provider list by the selected sort key first; the active filter set then
     * narrows the visible list. Keep the sort/filter passes separated so the histogram can
     * count against the *unfiltered* superset while the cards/markers reflect the filtered view.
     */
    const sortedProviders = useMemo(() => {
        // Dedupe first so the same company is never listed twice (provider id, else
        // place id, else normalised name as the identity key).
        const seen = new Set<string>();
        const deduped: MatchProvider[] = [];
        for (const p of providers) {
            const key = (p.providerId || p.placeId || p.name || '').toLowerCase().trim();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            deduped.push(p);
        }
        return deduped.sort((a, b) =>
            compareForSort(filterState.sort, a, b, providerPriorityScore)
        );
    }, [providers, filterState.sort]);
    const filteredProviders = useMemo(
        () => applyMatchFilters(sortedProviders, filterState),
        [sortedProviders, filterState]
    );
    const sheetProviders = filteredProviders;

    const selectedProvider = useMemo(() => {
        const idx = Math.min(Math.max(companyIndex - 1, 0), Math.max(sheetProviders.length - 1, 0));
        return sheetProviders[idx] || null;
    }, [sheetProviders, companyIndex]);

    /** Keep current place id for enrich queue priority without re-running the effect when selection changes. */
    const selectedPlaceIdForEnrichRef = useRef<string | null>(null);
    selectedPlaceIdForEnrichRef.current = selectedProvider?.placeId
        ? String(selectedProvider.placeId).trim()
        : null;

    useEffect(() => {
        // Reset whenever the user moves to a different provider.
        providerContactFiredForProviderIdRef.current = null;
    }, [selectedProvider?.providerId]);

    const {
        mendrReviewCountByProviderId,
        setMendrReviewCountByProviderId,
        enrichmentCache,
        setEnrichmentCache,
        isEnrichmentLoading,
        setIsEnrichmentLoading,
        summarySkeletonLongWait,
        lastEnrichQueueSignatureRef,
        enrichmentKick,
        setEnrichmentKick,
        enrichmentQueueRetryCountRef,
        hydratedFromCacheRef,
        skipInitialProviderFetchRef,
        enrichmentCacheRef,
        enrichmentPendingKey,
    } = useEnrichmentState({
        conversationId,
        sortedProviders,
        lastProviderFetchKeyRef,
    });

    useEffect(() => {
        if (!conversationId) return;
        let cancelled = false;
        hydratedFromCacheRef.current = false;
        skipInitialProviderFetchRef.current = false;
        void (async () => {
            const cached = loadMatchPageCache(conversationId);
            if (!cached) {
                trackEvent('prefetch_cache_miss', {
                    diagnosis_id: conversationId,
                    reason: 'no_cache',
                });
                return;
            }
            if (cached.diagnosisVersion) {
                const current = await fetchConversationDiagnosis(conversationId);
                const diagnosis = current.ok ? ((current.data?.diagnosis as any) ?? null) : null;
                const currentVersion =
                    diagnosis && typeof diagnosis === 'object' ? buildDiagnosisVersion(diagnosis) : '';
                if (currentVersion && currentVersion !== cached.diagnosisVersion) {
                    trackEvent('prefetch_discarded', {
                        diagnosis_id: conversationId,
                        reason: 'diagnosis_version_mismatch',
                    });
                    return;
                }
            }
            if (cancelled) return;
            trackEvent('prefetch_cache_hit', {
                diagnosis_id: conversationId,
            });
            hydratedFromCacheRef.current = true;
            skipInitialProviderFetchRef.current = cached.providers.length > 0;
            setCachedDiagnosisVersion(cached.diagnosisVersion);
            setUserLocation(cached.userLocation);
            setAddressInput(cached.addressInput);
            setProviders(cached.providers);
            setCompanyIndex((prev) => {
                const maxIndex = Math.max(cached.providers.length, 1);
                const requested = cached.companyIndex || prev || 1;
                return Math.min(Math.max(requested, 1), maxIndex);
            });
            setEnrichmentCache(cached.enrichmentCache || {});
            setMendrReviewCountByProviderId(cached.mendrReviewCountByProviderId || {});
            if (
                typeof cached.searchRadiusMeters === 'number' &&
                Number.isFinite(cached.searchRadiusMeters) &&
                cached.searchRadiusMeters > 0
            ) {
                setSearchRadiusMeters(cached.searchRadiusMeters);
            }
            setIsLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [conversationId, setAddressInput, setCompanyIndex, setProviders, setUserLocation]);

    useEffect(() => {
        if (!userLocation) return;
        if (skipInitialProviderFetchRef.current) {
            skipInitialProviderFetchRef.current = false;
            lastProviderFetchKeyRef.current = `${userLocation.lat.toFixed(5)},${userLocation.lng.toFixed(5)},${searchRadiusMeters}`;
            return;
        }
        const fetchKey = `${userLocation.lat.toFixed(5)},${userLocation.lng.toFixed(5)},${searchRadiusMeters}`;
        if (fetchKey === lastProviderFetchKeyRef.current) return;
        lastProviderFetchKeyRef.current = fetchKey;
        void refreshProvidersForLocation(userLocation, searchRadiusMeters);
    }, [userLocation, searchRadiusMeters, refreshProvidersForLocation]);

    useEffect(() => {
        if (!conversationId) return;
        saveMatchPageCache(conversationId, {
            providers,
            companyIndex,
            diagnosisVersion: cachedDiagnosisVersion,
            searchRadiusMeters,
            userLocation,
            addressInput,
            enrichmentCache,
            mendrReviewCountByProviderId,
            savedAt: Date.now(),
        });
    }, [
        addressInput,
        companyIndex,
        conversationId,
        cachedDiagnosisVersion,
        enrichmentCache,
        providers,
        mendrReviewCountByProviderId,
        searchRadiusMeters,
        userLocation,
    ]);

    useEnrichmentQueueAndPoll({
        enrichmentPendingKey,
        providersCount: providers.length,
        providersFromViewportCache,
        resolveTradeContext,
        enrichmentKick,
        sortedProviders,
        enrichmentCache,
        selectedPlaceIdForEnrichRef,
        enrichmentCacheRef,
        lastEnrichQueueSignatureRef,
        enrichmentQueueRetryCountRef,
        setEnrichmentCache,
        setIsEnrichmentLoading,
        setEnrichmentKick,
    });

    useMendrReviewCountFetch({
        selectedProvider,
        mendrReviewCountByProviderId,
        setMendrReviewCountByProviderId,
    });

    useEffect(() => {
        if (sheetProviders.length === 0) return;
        setCompanyIndex((prev) => Math.min(Math.max(prev, 1), sheetProviders.length));
    }, [sheetProviders.length, setCompanyIndex]);

    const { updateLocationFromAddress, handleUseCurrentLocation } = useLocationSearch({
        conversationId,
        setIsUpdatingLocation,
        setIsLocatingUser,
        setIsLoading,
        setProviders,
        setCompanyIndex,
        setSearchRadiusMeters,
        lastProviderFetchKeyRef,
        setUserLocation,
        setAddressInput,
        persistConversationLocation,
        getCurrentCoordinates,
    });

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (skipInitialProviderFetchRef.current) {
                skipInitialProviderFetchRef.current = false;
                return;
            }
            setIsLoading(true);
            try {
                await ensureLocation();
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [conversationId, ensureLocation]);

    useEffect(() => {
        if (!userLocation) return;
        setAddressInput(userLocation.address || `${userLocation.lat}, ${userLocation.lng}`);
    }, [userLocation]);

    const focusAddressSearch = useCallback(() => {
        const el = document.getElementById('match-address-input');
        if (el instanceof HTMLInputElement) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            window.setTimeout(() => el.focus(), 250);
        }
    }, []);

    // Keep current providers visible while we fetch more (e.g. radius expansion).
    const showBottomSkeleton = (isLoading || isProvidersLoading) && providers.length === 0;
    const noProviders = !showBottomSkeleton && providers.length === 0;
    // Fire match_view once when providers first load.
    const matchViewFiredRef = useRef(false);
    useEffect(() => {
        if (!matchViewFiredRef.current && providers.length > 0) {
            matchViewFiredRef.current = true;
            trackEvent('match_view', { diagnosis_id: conversationId || undefined });
            // Durable "Matches Shown" funnel stamp (server-side, first write wins).
            // Unlike the analytics event above, this persists to diagnosis_funnel.
            if (conversationId) {
                void fetch(
                    `/api/diagnoses/${encodeURIComponent(conversationId)}/matches-shown`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ matchCount: providers.length }),
                        keepalive: true,
                    },
                ).catch(() => {});
            }
        }
    }, [providers.length, conversationId]);

    const trackContactIntent = useCallback(
        (channel: 'phone' | 'email' | 'whatsapp') => {
            if (!conversationId || !selectedProvider?.providerId) return;
            if (providerContactFiredForProviderIdRef.current !== selectedProvider.providerId) {
                providerContactFiredForProviderIdRef.current = selectedProvider.providerId;
                trackEvent('provider_contact', {
                    provider_id: selectedProvider.providerId,
                    diagnosis_id: conversationId,
                });
            }
            void restoreProviderTokenApi({
                providerId: selectedProvider.providerId,
                conversationId,
                channel,
            });
        },
        [conversationId, selectedProvider?.providerId]
    );

    const trackProviderContactOnceOnOpen = useCallback(() => {
        if (!conversationId || !selectedProvider?.providerId) return;
        if (providerContactFiredForProviderIdRef.current === selectedProvider.providerId) return;
        providerContactFiredForProviderIdRef.current = selectedProvider.providerId;
        trackEvent('provider_contact', {
            provider_id: selectedProvider.providerId,
            diagnosis_id: conversationId,
        });
    }, [conversationId, selectedProvider?.providerId]);

    const openProviderDetails = useCallback(async (targetProvider: MatchProvider | null) => {
        if (!targetProvider?.providerId) return;
        // Identity is gated: a locked card cannot open the full profile. Prompt
        // sign-in instead (the profile reveals name and contact).
        if (targetProvider.identityLocked) {
            setAuthOpen(true);
            return;
        }
        // Track when a user actually opens provider details.
        trackEvent('provider_profile_view', {
            provider_id: targetProvider.providerId,
            diagnosis_id: conversationId,
        });
        if (!matchCardEnrichmentResolved(enrichmentCache, targetProvider)) {
            const { trade } = await resolveTradeContext();
            void queueEnrichmentApi([targetProvider.placeId], trade || undefined, {
                priorityPlaceId: targetProvider.placeId,
                providerIds: [targetProvider.providerId],
            }).catch(() => {});
        }
        const cid = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : '';
        router.push(`/pro/${encodeURIComponent(targetProvider.providerId)}${cid}`);
    }, [conversationId, enrichmentCache, resolveTradeContext, router]);

    const addressField = (
        <AddressSearchField
            value={addressInput}
            onValueChange={setAddressInput}
            onSubmit={() => {
                void updateLocationFromAddress(addressInput);
            }}
            inputDisabled={isUpdatingLocation || isLoading}
            locateDisabled={isUpdatingLocation || isLoading || isLocatingUser}
            isLocating={isLocatingUser}
            onUseCurrentLocation={() => {
                void handleUseCurrentLocation();
            }}
        />
    );

    const openSortFilter = () => {
        setIsFilterSheetOpen(true);
        trackEvent('match_filter_open', {
            diagnosis_id: conversationId || undefined,
            active_filter_count: activeFilterCount,
        });
    };

    const sortFilterControls = (
        <Button type="button" variant="secondary" className="w-full" onClick={openSortFilter}>
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </Button>
    );

    // The gate: sign in -> captured number -> consent, then contact.
    const beginContact = (provider: MatchProvider, channel: ContactChannel) =>
        beginContactAction(provider, channel, {
            conversationId,
            trackContactIntent,
            user,
            router,
            consentMode,
            setConsentMode,
            setPendingContact,
            setAuthOpen,
            setConsentOpen,
        });

    const handleConsentConfirm = (dontAskAgain: boolean) =>
        confirmConsentAndContact(dontAskAgain, {
            conversationId,
            trackContactIntent,
            pendingContact,
            setConsentMode,
            setContactBusy,
            setConsentOpen,
            setPendingContact,
        });

    const renderContactSlot = (provider: MatchProvider, idx: number) => (
        <ContactPopover
            provider={provider}
            open={contactOpen && companyIndex - 1 === idx}
            onOpenChange={(open) => {
                if (open) setCompanyIndex(idx + 1);
                setContactOpen(open);
                if (open) trackProviderContactOnceOnOpen();
            }}
            onSelectChannel={(channel) => {
                setContactOpen(false);
                void beginContact(provider, channel);
            }}
        />
    );

    const renderProviderCard = (provider: MatchProvider, idx: number) => {
        const enrich = enrichmentEntryForProvider(enrichmentCache, provider);
        const mendrSummary = (enrich?.reviewSummary ?? '').trim();
        const googleSummary = (provider.summary ?? '').trim();
        const providerAiSummary = (provider.enrichmentReviewSummary ?? '').trim();
        const displaySummary = mendrSummary || googleSummary || providerAiSummary;
        const reviewCount = totalReviewCountForProvider(provider, mendrReviewCountByProviderId);
        const enrichmentResolved = matchCardEnrichmentResolved(enrichmentCache, provider);
        const showSummarySkeleton =
            !displaySummary && !enrichmentResolved && isEnrichmentLoading && !summarySkeletonLongWait;
        const summaryText = displaySummary
            ? formatCustomerSummary(displaySummary, provider.name)
            : null;
        return (
            <ProviderCard
                key={provider.placeId}
                provider={provider}
                reviewCount={reviewCount}
                summary={summaryText}
                summaryLoading={showSummarySkeleton}
                onSelect={() => setCompanyIndex(idx + 1)}
                onViewMore={() => {
                    void openProviderDetails(provider);
                }}
                contactSlot={renderContactSlot(provider, idx)}
            />
        );
    };

    /** Drop companies that resolved enrichment with no review summary; keep pending ones (skeleton). */
    const providerHasSummary = (p: MatchProvider) => {
        const enrich = enrichmentEntryForProvider(enrichmentCache, p);
        const summary =
            (enrich?.reviewSummary ?? '').trim() ||
            (p.summary ?? '').trim() ||
            (p.enrichmentReviewSummary ?? '').trim();
        if (summary.length > 0) return true;
        return isEnrichmentLoading && !matchCardEnrichmentResolved(enrichmentCache, p);
    };
    const visibleProviders = sheetProviders.filter(providerHasSummary);

    const listContent = showBottomSkeleton ? (
        <MatchListSkeleton />
    ) : noProviders ? (
        <MatchNoProvidersEmpty onEditAddress={focusAddressSearch} />
    ) : visibleProviders.length === 0 ? (
        <MatchFilteredEmpty
            onClearFilters={() => {
                resetFilters();
                trackEvent('match_filter_clear', {
                    diagnosis_id: conversationId || undefined,
                });
            }}
        />
    ) : (
        <div className="flex flex-col gap-4">
            {visibleProviders.map((provider, idx) => renderProviderCard(provider, idx))}
        </div>
    );

    return (
        <>
        <MatchResultsLayout
            onClose={() => {
                if (!conversationId) {
                    router.back();
                    return;
                }
                router.push(`/diagnosis/${encodeURIComponent(conversationId)}`);
            }}
            addressSlot={addressField}
            controlsSlot={sortFilterControls}
        >
                {listContent}
        </MatchResultsLayout>

        <FilterSheet
            open={isFilterSheetOpen}
            onOpenChange={(next) => {
                setIsFilterSheetOpen(next);
                if (!next) {
                    trackEvent('match_filter_close', {
                        diagnosis_id: conversationId || undefined,
                        active_filter_count: activeFilterCount,
                    });
                }
            }}
            state={filterState}
            onApply={(next: MatchFilterState) => {
                setFilterState(next);
                setIsFilterSheetOpen(false);
                // If user widened distance past current search radius, expand to 50 km so the
                // server can fetch the broader set on the next location refresh.
                const requiredKm = Math.max(next.distanceMaxKm, DEFAULT_FILTER_STATE.distanceMaxKm);
                if (
                    requiredKm * 1000 > searchRadiusMeters &&
                    requiredKm * 1000 <= EXTENDED_SEARCH_RADIUS_METERS
                ) {
                    setSearchRadiusMeters(EXTENDED_SEARCH_RADIUS_METERS);
                }
                trackEvent('match_filter_apply', {
                    diagnosis_id: conversationId || undefined,
                    active_filter_count: 0, // recomputed by hook after URL change
                    sort: next.sort,
                });
            }}
            providers={sortedProviders}
            maxDistanceKm={50}
        />

        <HomeownerAuthDialog
            open={authOpen}
            onOpenChange={setAuthOpen}
            reason="Sign in to contact this specialist — it's free."
        />
        <ContactConsentDialog
            open={consentOpen}
            onOpenChange={(o) => {
                setConsentOpen(o);
                if (!o) setPendingContact(null);
            }}
            businessName={pendingContact?.provider.name || 'this specialist'}
            onConfirm={(dontAsk) => void handleConsentConfirm(dontAsk)}
            busy={contactBusy}
        />
        </>
    );
}
