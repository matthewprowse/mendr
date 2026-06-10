import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/site-url', () => ({
    getAppOrigin: () => 'https://app.test',
    getSiteUrl: () => 'https://app.test',
}));

import { geocodeAddress } from '../geocode';

const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true): Response {
    return { ok, json: async () => body } as unknown as Response;
}

describe('geocodeAddress', () => {
    it('returns null for an address shorter than 4 chars without calling fetch', async () => {
        const res = await geocodeAddress('ab');
        expect(res).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('posts to /api/geocode with westernCapeOnly and returns coordinates', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({ lat: -33.9, lng: 18.4, address: '12 Main Road, Claremont' }),
        );
        const res = await geocodeAddress('12 Main Road, Claremont');
        expect(res).toEqual({ lat: -33.9, lng: 18.4, address: '12 Main Road, Claremont' });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://app.test/api/geocode');
        expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
            address: '12 Main Road, Claremont',
            westernCapeOnly: true,
        });
    });

    it('falls back to the input address when the body omits a string address', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ lat: -33.9, lng: 18.4 }));
        const res = await geocodeAddress('14 Balmoral Road');
        expect(res).toEqual({ lat: -33.9, lng: 18.4, address: '14 Balmoral Road' });
    });

    it('returns null when the response is not ok', async () => {
        fetchMock.mockResolvedValue(jsonResponse({}, false));
        expect(await geocodeAddress('12 Main Road')).toBeNull();
    });

    it('returns null when lat/lng are missing or non-numeric', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ lat: 'x', lng: null }));
        expect(await geocodeAddress('12 Main Road')).toBeNull();
    });

    it('returns null on a network error', async () => {
        fetchMock.mockRejectedValue(new Error('network'));
        expect(await geocodeAddress('12 Main Road')).toBeNull();
    });

    it('uses an https requestOrigin override when provided', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ lat: 1, lng: 2 }));
        await geocodeAddress('12 Main Road', { requestOrigin: 'https://sim.local' });
        expect(fetchMock.mock.calls[0][0]).toBe('https://sim.local/api/geocode');
    });

    it('ignores a non-http requestOrigin and falls back to the app origin', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ lat: 1, lng: 2 }));
        await geocodeAddress('12 Main Road', { requestOrigin: 'javascript:evil' });
        expect(fetchMock.mock.calls[0][0]).toBe('https://app.test/api/geocode');
    });
});
