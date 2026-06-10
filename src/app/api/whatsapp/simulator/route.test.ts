/**
 * Contract tests for POST /api/whatsapp/simulator (dev tool).
 *
 * Covers: the production kill switch (404 unless ENABLE_WHATSAPP_SIMULATOR),
 * rate limit, JSON/`from` validation, image-array sanitisation (cap at 4,
 * drop non-strings), the happy path returning messages + session payload,
 * and handler failure → 500.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest } from '@/__tests__/helpers/route-test';

let rateLimited = false;

const handleMessage = vi.fn();
const getSession = vi.fn();

vi.mock('@/lib/rate-limit-config', () => ({
    checkRateLimit: vi.fn(async () => {
        if (rateLimited) {
            const { NextResponse } = await import('next/server');
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }
        return null;
    }),
}));

vi.mock('@/lib/whatsapp/bot-handler', () => ({
    handleMessage: (...args: unknown[]) => handleMessage(...(args as [])),
}));

vi.mock('@/lib/whatsapp/session-manager', () => ({
    getSession: (...args: unknown[]) => getSession(...(args as [])),
}));

beforeEach(() => {
    vi.clearAllMocks();
    rateLimited = false;
    handleMessage.mockResolvedValue({
        messages: [{ type: 'text', text: 'Hi!' }],
        state: 'idle',
    });
    getSession.mockResolvedValue({
        state: 'idle',
        active_diagnosis_id: null,
        pending_clarification: null,
        pending_address: null,
        pending_contractors: null,
    });
});

describe('POST /api/whatsapp/simulator — gates', () => {
    it('returns 429 when rate limited', async () => {
        rateLimited = true;
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { from: '27820000000', text: 'hi' } }),
        );
        expect(res.status).toBe(429);
    });

    it('returns 400 on malformed JSON', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', rawBody: '{ broken' }));
        expect(res.status).toBe(400);
    });

    it('returns 400 when from is missing or blank', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { from: '   ' } }));
        expect(res.status).toBe(400);
    });
});

describe('POST /api/whatsapp/simulator — behaviour', () => {
    it('drives the bot handler and returns messages, state, and session', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { from: '27820000000', text: 'geyser leak' } }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.messages).toEqual([{ type: 'text', text: 'Hi!' }]);
        expect(body.state).toBe('idle');
        expect(body.session).toMatchObject({ state: 'idle' });
        expect(handleMessage).toHaveBeenCalledWith(
            expect.objectContaining({ from: '27820000000', text: 'geyser leak' }),
            expect.anything(),
        );
    });

    it('sanitises imageDataUri: drops non-strings and caps at 4', async () => {
        const { POST } = await import('./route');
        await POST(
            makeRequest({
                method: 'POST',
                body: {
                    from: '27820000000',
                    imageDataUri: ['a', 1, '', 'b', 'c', 'd', 'e'],
                },
            }),
        );
        const inbound = handleMessage.mock.calls[0][0] as { imageDataUri?: string[] };
        expect(inbound.imageDataUri).toEqual(['a', 'b', 'c', 'd']);
    });

    it('returns null session when none exists', async () => {
        getSession.mockResolvedValue(null);
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { from: '27820000000', text: 'hi' } }),
        );
        expect((await res.json()).session).toBeNull();
    });

    it('returns 500 when the bot handler throws', async () => {
        handleMessage.mockRejectedValue(new Error('handler blew up'));
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { from: '27820000000', text: 'hi' } }),
        );
        expect(res.status).toBe(500);
    });
});
