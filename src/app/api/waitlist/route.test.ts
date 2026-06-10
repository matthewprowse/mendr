/**
 * Contract tests for POST /api/waitlist (contractor waitlist sign-up).
 *
 * Note: this endpoint still uses ad-hoc validation. We test it against its
 * current contract; a later Zod migration can land alongside these tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({
    checkRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({
        tables: { provider_applications: { data: null, error: null } },
    });
});

const validBody = {
    name: 'Ada Lovelace',
    business_name: 'Lovelace Plumbing',
    trade: 'Plumbing',
    phone: '+27821234567',
    email: 'ada@example.com',
    areas: 'Cape Town CBD, Sea Point',
    message: 'Hi, I would like to apply.',
    source: 'Instagram',
    years_experience: 5,
};

describe('POST /api/waitlist — validation', () => {
    it('returns 400 on malformed body', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: undefined, rawBody: 'nope' }));
        expect(res.status).toBe(400);
    });

    it('returns 400 when trade is not in the whitelist', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { ...validBody, trade: 'Wizardry' } }),
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/trade/i);
    });

    it('returns 400 when email is missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { ...validBody, email: '' } }),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when name is empty', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { ...validBody, name: '' } }),
        );
        expect(res.status).toBe(400);
    });
});

describe('POST /api/waitlist — happy path', () => {
    it('returns { ok: true } on valid submission', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: validBody }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
    });
});

describe('POST /api/waitlist — edge cases', () => {
    it('returns { ok: true, duplicate: true } on unique-violation', async () => {
        supabase = mockSupabaseClient({
            tables: {
                provider_applications: { data: null, error: { message: 'dup', code: '23505' } },
            },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: validBody }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ ok: true, duplicate: true });
    });

    it('returns 429 when rate limited', async () => {
        const { NextResponse } = await import('next/server');
        const rateLimitConfig = await import('@/lib/rate-limit-config');
        vi.mocked(rateLimitConfig.checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: 'rate_limited' }, { status: 429 }),
        );
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: validBody }));
        expect(res.status).toBe(429);
    });
});
