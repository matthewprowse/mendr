import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest } from '@/__tests__/helpers/route-test';

vi.mock('@/lib/rate-limit-config', () => ({
    checkRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/service-catalog-server', () => ({
    getServiceCatalogLabelsCached: vi.fn(async () => ['Plumbing', 'Electrical']),
}));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('GET /api/service-catalog', () => {
    it('returns labels with cache headers', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/service-catalog' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.labels).toEqual(['Plumbing', 'Electrical']);
        expect(res.headers.get('cache-control')).toMatch(/max-age=60/);
    });

    it('returns 500 + empty labels on backend failure', async () => {
        const catalog = await import('@/lib/service-catalog-server');
        vi.mocked(catalog.getServiceCatalogLabelsCached).mockRejectedValueOnce(new Error('boom'));
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/service-catalog' }));
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.labels).toEqual([]);
    });

    it('returns 429 when rate-limited', async () => {
        const { NextResponse } = await import('next/server');
        const rateLimitConfig = await import('@/lib/rate-limit-config');
        vi.mocked(rateLimitConfig.checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: 'rl' }, { status: 429 }),
        );
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/service-catalog' }));
        expect(res.status).toBe(429);
    });
});
