import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest } from '@/__tests__/helpers/route-test';

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));

const loadContractorProfileById = vi.fn();
vi.mock('@/lib/providers/contractor-profile-server', () => ({
    loadContractorProfileById,
}));

beforeEach(() => {
    vi.clearAllMocks();
});

function mkParams(id: string) {
    return { params: Promise.resolve({ id }) };
}

describe('GET /api/providers/[id]', () => {
    it('returns 400 on bad_request from loader', async () => {
        loadContractorProfileById.mockResolvedValueOnce({ status: 'bad_request' });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/providers/' }), mkParams(''));
        expect(res.status).toBe(400);
    });

    it('returns 404 when provider missing', async () => {
        loadContractorProfileById.mockResolvedValueOnce({ status: 'not_found' });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/providers/abc' }), mkParams('abc'));
        expect(res.status).toBe(404);
    });

    it('returns 200 + profile on ok', async () => {
        loadContractorProfileById.mockResolvedValueOnce({
            status: 'ok',
            profile: { id: 'p1', name: 'Pro' },
            leakDetected: false,
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/providers/p1' }), mkParams('p1'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.provider.id).toBe('p1');
        expect(body.leakDetected).toBe(false);
    });

    it('returns 500 on loader error', async () => {
        loadContractorProfileById.mockResolvedValueOnce({ status: 'error', message: 'boom' });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/providers/p1' }), mkParams('p1'));
        expect(res.status).toBe(500);
    });

    it('returns 429 when rate-limited', async () => {
        const { NextResponse } = await import('next/server');
        const rl = await import('@/lib/rate-limit-config');
        vi.mocked(rl.checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: 'rl' }, { status: 429 }),
        );
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/providers/p1' }), mkParams('p1'));
        expect(res.status).toBe(429);
    });
});
