import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/site-url', () => ({
    getAppOrigin: () => 'https://app.test',
    getSiteUrl: () => 'https://app.test',
}));

import { matchContractors, logContractorLead } from '../contractor-matcher';

const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true, status = 200): Response {
    return { ok, status, json: async () => body } as unknown as Response;
}

describe('matchContractors', () => {
    it('maps the providers response into 1-based PendingContractor rows', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({
                providers: [
                    {
                        providerId: 'p1',
                        name: 'Cape Gates',
                        address: 'Claremont',
                        phone: '021 555 0123',
                        website: 'https://capegates.co.za',
                    },
                    {
                        name: 'Google Listing',
                        address: '',
                        phone: null,
                        website: null,
                    },
                ],
            }),
        );
        const res = await matchContractors({
            lat: -33.9,
            lng: 18.4,
            trade: 'Garage Doors',
        });
        expect(res).toHaveLength(2);
        expect(res[0]).toMatchObject({
            index: 1,
            providerId: 'p1',
            name: 'Cape Gates',
            address: 'Claremont',
            email: null,
        });
        // No providerId on a Google listing → null; falsy address → null.
        expect(res[1]).toMatchObject({ index: 2, providerId: null, address: null });
    });

    it('posts to /api/providers with the full ranking body (no quick flag)', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ providers: [] }));
        await matchContractors({ lat: 1, lng: 2, trade: 'Plumbing', tradeDetail: 'Geyser' });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://app.test/api/providers');
        const body = JSON.parse((init as RequestInit).body as string);
        expect(body).toMatchObject({ lat: 1, lng: 2, trade: 'Plumbing', tradeDetail: 'Geyser' });
        expect(body.radius).toBe(15000);
        expect(body.quick).toBeUndefined();
    });

    it('returns [] when no providers are returned', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ providers: [] }));
        expect(await matchContractors({ lat: 1, lng: 2, trade: 'X' })).toEqual([]);
    });

    it('returns [] on a non-ok response', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        fetchMock.mockResolvedValue(jsonResponse({}, false, 500));
        expect(await matchContractors({ lat: 1, lng: 2, trade: 'X' })).toEqual([]);
        errSpy.mockRestore();
    });

    it('returns [] on a network error', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        fetchMock.mockRejectedValue(new Error('network'));
        expect(await matchContractors({ lat: 1, lng: 2, trade: 'X' })).toEqual([]);
        errSpy.mockRestore();
    });
});

describe('logContractorLead', () => {
    it('posts the lead to /api/contact/contractor and returns true on success', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
        const ok = await logContractorLead({
            providerId: 'p1',
            diagnosisId: 'd1',
            homeownerWhatsapp: '27821234567',
        });
        expect(ok).toBe(true);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://app.test/api/contact/contractor');
        const body = JSON.parse((init as RequestInit).body as string);
        expect(body).toMatchObject({
            providerId: 'p1',
            diagnosisId: 'd1',
            homeownerWhatsapp: '27821234567',
            channel: 'whatsapp',
        });
    });

    it('returns false on a non-ok response', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        fetchMock.mockResolvedValue(jsonResponse({}, false, 409));
        const ok = await logContractorLead({
            providerId: 'p1',
            diagnosisId: 'd1',
            homeownerWhatsapp: null,
        });
        expect(ok).toBe(false);
        errSpy.mockRestore();
    });

    it('returns false on a network error', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        fetchMock.mockRejectedValue(new Error('network'));
        const ok = await logContractorLead({
            providerId: 'p1',
            diagnosisId: 'd1',
            homeownerWhatsapp: null,
        });
        expect(ok).toBe(false);
        errSpy.mockRestore();
    });
});
