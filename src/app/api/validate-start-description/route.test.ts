import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest } from '@/__tests__/helpers/route-test';

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/diagnosis/start-description-quality', () => ({
    assessStartDescription: vi.fn((text: string) => {
        if (!text || text.length < 8) return { ok: false, message: 'Tell us more.' };
        return { ok: true };
    }),
}));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('POST /api/validate-start-description', () => {
    it('returns ok=true for a sufficient description', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { text: 'There is a leak under the kitchen sink.' } }),
        );
        const body = await res.json();
        expect(body.ok).toBe(true);
    });

    it('returns ok=false with a message for short text', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { text: 'hi' } }));
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.message).toBeTruthy();
    });

    it('returns ok=false for non-string text', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { text: 42 } }));
        const body = await res.json();
        expect(body.ok).toBe(false);
    });

    it('returns 429 when rate limited', async () => {
        const { NextResponse } = await import('next/server');
        const rl = await import('@/lib/rate-limit-config');
        vi.mocked(rl.checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: 'rl' }, { status: 429 }),
        );
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { text: 'hello' } }));
        expect(res.status).toBe(429);
    });
});
