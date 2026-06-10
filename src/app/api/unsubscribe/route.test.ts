/**
 * Contract tests for GET /api/unsubscribe.
 *
 * The token format is `<base64url(email:timestamp)>.<base64url(hmac)>`
 * signed with CRON_SECRET. We exercise:
 *  - missing token → invalid link HTML
 *  - bad signature → expired link HTML
 *  - expired payload → expired link HTML
 *  - valid token → upsert + success HTML
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'crypto';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

vi.mock('@/lib/site-url', () => ({
    getSiteUrl: () => 'https://mendr.test',
}));

function signToken(email: string, ts: number, secret: string): string {
    const payload = `${email}:${ts}`;
    const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
    const sig = createHmac('sha256', secret).update(payload).digest('base64url');
    return `${payloadB64}.${sig}`;
}

beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
    supabase = mockSupabaseClient({
        tables: { email_suppressions: { data: null, error: null } },
    });
});

describe('GET /api/unsubscribe', () => {
    it('returns HTML with "Invalid link" when token is missing', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/unsubscribe' }));
        expect(res.headers.get('content-type')).toMatch(/text\/html/);
        const text = await res.text();
        expect(text).toMatch(/Invalid link/);
    });

    it('returns "Link expired" HTML when signature is wrong', async () => {
        const { GET } = await import('./route');
        const bad = signToken('test@example.com', Date.now(), 'wrong-secret');
        const res = await GET(makeRequest({ path: `/api/unsubscribe?token=${encodeURIComponent(bad)}` }));
        const text = await res.text();
        expect(text).toMatch(/Link expired|invalid/i);
    });

    it('returns "Link expired" for tokens older than 30 days', async () => {
        const { GET } = await import('./route');
        const oldTs = Date.now() - 31 * 24 * 60 * 60 * 1000;
        const token = signToken('test@example.com', oldTs, 'test-secret');
        const res = await GET(makeRequest({ path: `/api/unsubscribe?token=${encodeURIComponent(token)}` }));
        const text = await res.text();
        expect(text).toMatch(/Link expired/);
    });

    it('returns the "unsubscribed" HTML + upserts on a valid token', async () => {
        const { GET } = await import('./route');
        const token = signToken('user@example.com', Date.now(), 'test-secret');
        const res = await GET(makeRequest({ path: `/api/unsubscribe?token=${encodeURIComponent(token)}` }));
        const text = await res.text();
        expect(text).toMatch(/unsubscribed/i);
        expect(text).toMatch(/user@example\.com/);
        expect(supabase.from).toHaveBeenCalledWith('email_suppressions');
    });

    it('still returns the success page when the DB upsert throws', async () => {
        // Replace the supabase.from to throw; the route should swallow and still return success HTML.
        const original = supabase.from;
        supabase.from = vi.fn(() => {
            throw new Error('boom');
        }) as typeof original;
        const { GET } = await import('./route');
        const token = signToken('user@example.com', Date.now(), 'test-secret');
        const res = await GET(makeRequest({ path: `/api/unsubscribe?token=${encodeURIComponent(token)}` }));
        const text = await res.text();
        expect(text).toMatch(/unsubscribed/i);
    });
});
