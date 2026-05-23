import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest } from '@/__tests__/helpers/route-test';

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));

const generateContent = vi.fn(async () => ({
    response: { text: () => 'Hi there, please help.' },
}));
vi.mock('@/lib/ai/ai-client', () => ({
    getGeminiModel: () => ({ generateContent }),
}));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('POST /api/whatsapp-message', () => {
    it('returns fallback template when GEMINI_API_KEY is unset', async () => {
        delete process.env.GEMINI_API_KEY;
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { provider_name: 'Acme', diagnosis: 'leaky tap', trade: 'Plumbing' },
            }),
        );
        const body = await res.json();
        expect(body.message).toContain('Acme');
        expect(body.message).toContain('Plumbing');
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('returns Gemini-generated message when key is set', async () => {
        process.env.GEMINI_API_KEY = 'test';
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({
                method: 'POST',
                body: { provider_name: 'Acme', diagnosis: 'leaky tap', trade: 'Plumbing' },
            }),
        );
        const body = await res.json();
        expect(body.message).toBe('Hi there, please help.');
    });

    it('falls back to template when Gemini throws', async () => {
        process.env.GEMINI_API_KEY = 'test';
        generateContent.mockRejectedValueOnce(new Error('gemini down'));
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { provider_name: 'Acme', diagnosis: 'x', trade: 'Plumbing' } }),
        );
        const body = await res.json();
        expect(body.message).toContain('Acme');
    });

    it('returns 400 on completely malformed body (matches other public POST routes)', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: undefined, rawBody: 'not json at all' }),
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body).toEqual({ error: 'Invalid JSON body' });
    });

    it('returns 429 when rate limited', async () => {
        const { NextResponse } = await import('next/server');
        const rl = await import('@/lib/rate-limit-config');
        vi.mocked(rl.checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: 'rl' }, { status: 429 }),
        );
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { provider_name: 'X' } }),
        );
        expect(res.status).toBe(429);
    });
});
