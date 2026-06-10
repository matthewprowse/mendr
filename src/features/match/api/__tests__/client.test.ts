/**
 * Phase 5 — match feature API client tests.
 *
 * These wrap `/api/providers`, `/api/geocode`, `/api/enrich/*` and
 * `/api/reviews-count`. They are tested against `vi.spyOn(global, 'fetch')`
 * (no MSW needed for node-runner). The module holds in-memory caches keyed on
 * coordinates / place IDs, so each test uses distinct inputs to avoid cross-test
 * cache hits.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    fetchProvidersApi,
    geocodeApi,
    queueEnrichmentApi,
    fetchEnrichmentApi,
    reviewsCountApi,
    restoreProviderTokenApi,
} from '@/features/match/api/client';
import type { ProvidersRequest } from '@/features/match/contracts';

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
    return {
        ok: init?.ok ?? true,
        status: init?.status ?? 200,
        json: async () => body,
    } as unknown as Response;
}

const BASE_REQUEST: ProvidersRequest = {
    lat: -33.9,
    lng: 18.4,
    trade: 'Plumbing',
    radius: 10_000,
};

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe('fetchProvidersApi', () => {
    it('POSTs to /api/providers and returns ok/status/data', async () => {
        const providers = [{ placeId: 'places/p1', name: 'Ace' }];
        fetchSpy.mockResolvedValue(jsonResponse({ providers }));
        const result = await fetchProvidersApi(BASE_REQUEST);
        expect(result.ok).toBe(true);
        expect(result.status).toBe(200);
        expect(result.data?.providers).toEqual(providers);

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/api/providers');
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body as string)).toMatchObject({ trade: 'Plumbing' });
    });

    it('returns ok:false with null data on a non-200 with unparseable body', async () => {
        fetchSpy.mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => {
                throw new Error('bad json');
            },
        } as unknown as Response);
        const result = await fetchProvidersApi(BASE_REQUEST);
        expect(result.ok).toBe(false);
        expect(result.status).toBe(500);
        expect(result.data).toBeNull();
    });

    it('forwards an AbortSignal to fetch', async () => {
        fetchSpy.mockResolvedValue(jsonResponse({ providers: [] }));
        const controller = new AbortController();
        await fetchProvidersApi(BASE_REQUEST, { signal: controller.signal });
        const init = fetchSpy.mock.calls[0][1] as RequestInit;
        expect(init.signal).toBe(controller.signal);
    });
});

describe('geocodeApi', () => {
    it('POSTs lat/lng and returns the parsed geocode result', async () => {
        fetchSpy.mockResolvedValue(jsonResponse({ address: 'Sea Point' }));
        const result = await geocodeApi({ lat: -33.91, lng: 18.41 });
        expect(result?.address).toBe('Sea Point');
        expect(fetchSpy.mock.calls[0][0]).toBe('/api/geocode');
    });

    it('caches lat/lng lookups so a repeat call does not hit fetch again', async () => {
        fetchSpy.mockResolvedValue(jsonResponse({ address: 'Camps Bay' }));
        const first = await geocodeApi({ lat: -33.95, lng: 18.37 });
        const second = await geocodeApi({ lat: -33.95, lng: 18.37 });
        expect(first?.address).toBe('Camps Bay');
        expect(second?.address).toBe('Camps Bay');
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('returns null when the network call rejects for a lat/lng request', async () => {
        fetchSpy.mockRejectedValue(new Error('offline'));
        const result = await geocodeApi({ lat: -34.0, lng: 18.5 });
        expect(result).toBeNull();
    });

    it('handles an address-only request without the lat/lng cache', async () => {
        fetchSpy.mockResolvedValue(jsonResponse({ lat: -33.92, lng: 18.42 }));
        const result = await geocodeApi({ address: 'Long Street, Cape Town' });
        expect(result?.lat).toBe(-33.92);
    });

    it('returns null when an address-only request rejects', async () => {
        fetchSpy.mockRejectedValue(new Error('offline'));
        const result = await geocodeApi({ address: 'Nowhere' });
        expect(result).toBeNull();
    });
});

describe('queueEnrichmentApi', () => {
    it('does nothing when there are no place ids and no provider ids', async () => {
        await queueEnrichmentApi([]);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('POSTs to /api/enrich/queue with normalised place ids', async () => {
        fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));
        await queueEnrichmentApi(['p1', 'places/p2'], 'Plumbing');
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/api/enrich/queue');
        const body = JSON.parse(init.body as string);
        expect(body.placeIds).toEqual(['places/p1', 'places/p2']);
        expect(body.trade).toBe('Plumbing');
    });

    it('falls back to provider-id-only batches when no place ids are supplied', async () => {
        fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));
        await queueEnrichmentApi([], 'Electrical', { providerIds: ['  id-1  ', ''] });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
        expect(body.providerIds).toEqual(['id-1']);
        expect(body.placeIds).toEqual([]);
    });
});

describe('fetchEnrichmentApi', () => {
    it('returns null for an empty input', async () => {
        const result = await fetchEnrichmentApi([]);
        expect(result).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('merges the cache map from /api/enrich/get', async () => {
        const cache = { 'places/uniqA': { googlePlaceId: 'places/uniqA', bio: 'hi' } };
        fetchSpy.mockResolvedValue(jsonResponse({ cache }));
        const result = await fetchEnrichmentApi(['uniqA']);
        expect(result).not.toBeNull();
        expect(result!['places/uniqA']).toMatchObject({ bio: 'hi' });
        expect(fetchSpy.mock.calls[0][0]).toBe('/api/enrich/get');
    });

    it('returns null when the enrich/get response is not ok', async () => {
        fetchSpy.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));
        const result = await fetchEnrichmentApi(['uniqB']);
        expect(result).toBeNull();
    });
});

describe('reviewsCountApi', () => {
    it('returns normalised counts', async () => {
        fetchSpy.mockResolvedValue(jsonResponse({ mendrReviewCount: 4, googleReviewCount: 12 }));
        const result = await reviewsCountApi('prov-1');
        expect(result).toEqual({ mendrReviewCount: 4, googleReviewCount: 12 });
    });

    it('defaults missing counts to zero', async () => {
        fetchSpy.mockResolvedValue(jsonResponse({}));
        const result = await reviewsCountApi('prov-2');
        expect(result).toEqual({ mendrReviewCount: 0, googleReviewCount: 0 });
    });

    it('returns null when the network call rejects', async () => {
        fetchSpy.mockRejectedValue(new Error('offline'));
        const result = await reviewsCountApi('prov-3');
        expect(result).toBeNull();
    });
});

describe('restoreProviderTokenApi', () => {
    it('POSTs the restore-token payload and swallows errors', async () => {
        fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));
        await restoreProviderTokenApi({
            providerId: 'prov-1',
            conversationId: 'conv-1',
            channel: 'phone',
        });
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/api/providers/restore-token');
        expect(JSON.parse(init.body as string)).toMatchObject({ channel: 'phone' });
    });

    it('does not throw when the network call rejects', async () => {
        fetchSpy.mockRejectedValue(new Error('offline'));
        await expect(
            restoreProviderTokenApi({
                providerId: 'p',
                conversationId: 'c',
                channel: 'email',
            }),
        ).resolves.toBeUndefined();
    });
});
