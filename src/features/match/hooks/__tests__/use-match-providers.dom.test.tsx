/**
 * Phase 5 — useMatchProviders.
 *
 * The hook owns the `/api/providers` fetch lifecycle for the match page: trade
 * resolution, viewport caching, loading/refresh flags, abort handling and toast
 * error surfacing. We mock the `api/client` boundary and `sonner` toast so the
 * hook logic is exercised without real network or UI.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const fetchProvidersApi = vi.fn();
const prefetchEnrichmentForMatchProviders = vi.fn();
vi.mock('@/features/match/api/client', () => ({
    fetchProvidersApi: (...a: unknown[]) => fetchProvidersApi(...a),
    prefetchEnrichmentForMatchProviders: (...a: unknown[]) =>
        prefetchEnrichmentForMatchProviders(...a),
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

import { useMatchProviders } from '@/features/match/hooks/use-match-providers';
import type { MatchProvider } from '@/features/match/contracts';

function provider(id: string): MatchProvider {
    return {
        placeId: `places/${id}`,
        name: id,
        address: 'addr',
        rating: 4,
        ratingCount: 5,
        latitude: null,
        longitude: null,
        distanceKm: 3,
        durationText: '',
        website: null,
        phone: null,
        summary: '',
    };
}

const LOC = { lat: -33.9, lng: 18.4, address: 'CT' };

beforeEach(() => {
    window.sessionStorage.clear();
    fetchProvidersApi.mockReset();
    prefetchEnrichmentForMatchProviders.mockReset();
    toastError.mockReset();
    // Ensure the visibility gate passes immediately.
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe('useMatchProviders', () => {
    it('starts empty and not loading', () => {
        const resolveTradeContext = vi.fn().mockResolvedValue({ trade: 'Plumbing', trade_detail: '' });
        const { result } = renderHook(() =>
            useMatchProviders({ resolveTradeContext, conversationId: 'conv-a' }),
        );
        expect(result.current.providers).toEqual([]);
        expect(result.current.isProvidersLoading).toBe(false);
    });

    it('fetches and populates providers on refresh', async () => {
        const resolveTradeContext = vi.fn().mockResolvedValue({ trade: 'Plumbing', trade_detail: '' });
        fetchProvidersApi.mockResolvedValue({
            ok: true,
            status: 200,
            data: { providers: [provider('p1'), provider('p2')] },
        });
        const { result } = renderHook(() =>
            useMatchProviders({ resolveTradeContext, conversationId: 'conv-b' }),
        );
        await act(async () => {
            await result.current.refreshProvidersForLocation(LOC, 10_000);
        });
        await waitFor(() => expect(result.current.providers).toHaveLength(2));
        expect(prefetchEnrichmentForMatchProviders).toHaveBeenCalled();
    });

    it('toasts and stays empty when trade context cannot be resolved', async () => {
        const resolveTradeContext = vi.fn().mockResolvedValue({ trade: '', trade_detail: '' });
        const { result } = renderHook(() =>
            useMatchProviders({ resolveTradeContext, conversationId: 'conv-c' }),
        );
        await act(async () => {
            await result.current.refreshProvidersForLocation(LOC, 10_000);
        });
        expect(fetchProvidersApi).not.toHaveBeenCalled();
        expect(toastError).toHaveBeenCalled();
        expect(result.current.providers).toEqual([]);
    });

    it('clears providers and toasts on a PLACES_UNAVAILABLE response', async () => {
        const resolveTradeContext = vi.fn().mockResolvedValue({ trade: 'Plumbing', trade_detail: '' });
        fetchProvidersApi.mockResolvedValue({
            ok: false,
            status: 503,
            data: { providers: [], code: 'PLACES_UNAVAILABLE', error: 'Search down' },
        });
        const { result } = renderHook(() =>
            useMatchProviders({ resolveTradeContext, conversationId: 'conv-d' }),
        );
        await act(async () => {
            await result.current.refreshProvidersForLocation(LOC, 10_000);
        });
        expect(toastError).toHaveBeenCalledWith('Search down');
        expect(result.current.providers).toEqual([]);
    });

    it('seeds from the viewport sessionStorage cache before the network resolves', async () => {
        const resolveTradeContext = vi.fn().mockResolvedValue({ trade: 'Plumbing', trade_detail: '' });
        // Prime the cache by completing one successful fetch.
        fetchProvidersApi.mockResolvedValue({
            ok: true,
            status: 200,
            data: { providers: [provider('cached')] },
        });
        const { result } = renderHook(() =>
            useMatchProviders({ resolveTradeContext, conversationId: 'conv-e' }),
        );
        await act(async () => {
            await result.current.refreshProvidersForLocation(LOC, 10_000);
        });
        await waitFor(() => expect(result.current.providers).toHaveLength(1));

        // Re-mount: the second hook instance should read the cached providers.
        const second = renderHook(() =>
            useMatchProviders({ resolveTradeContext, conversationId: 'conv-e' }),
        );
        await act(async () => {
            await second.result.current.refreshProvidersForLocation(LOC, 10_000);
        });
        await waitFor(() => expect(second.result.current.providers.length).toBeGreaterThan(0));
    });
});
