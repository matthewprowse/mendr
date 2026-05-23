import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://mendr.test' }));

function freshSupabase(token: Record<string, unknown> | null = null) {
    return mockSupabaseClient({
        tables: {
            job_outcome_tokens: { data: token, error: null },
            job_outcomes: { data: null, error: null },
        },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('GET /api/job-outcome', () => {
    it('redirects to /rate/invalid when token missing', async () => {
        supabase = freshSupabase();
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/job-outcome?rating=5' }));
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toMatch(/\/rate\/invalid/);
    });

    it('redirects to /rate/invalid when rating is out of range', async () => {
        supabase = freshSupabase();
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/job-outcome?token=abc&rating=99' }));
        expect(res.headers.get('location')).toMatch(/invalid/);
    });

    it('redirects to /rate/invalid when token not found', async () => {
        supabase = freshSupabase(null);
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/job-outcome?token=missing&rating=5' }));
        expect(res.headers.get('location')).toMatch(/invalid/);
    });

    it('redirects to /rate/already-rated when used_at is set', async () => {
        supabase = freshSupabase({
            id: 'tk',
            used_at: '2026-01-01',
            expires_at: '2099-01-01',
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/job-outcome?token=tk&rating=4' }));
        expect(res.headers.get('location')).toMatch(/already-rated/);
    });

    it('redirects to /rate/expired when token has expired', async () => {
        supabase = freshSupabase({
            id: 'tk',
            used_at: null,
            expires_at: '2000-01-01',
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/job-outcome?token=tk&rating=4' }));
        expect(res.headers.get('location')).toMatch(/expired/);
    });

    it('redirects to /rate/thanks on success', async () => {
        supabase = freshSupabase({
            id: 'tk',
            used_at: null,
            expires_at: '2099-01-01',
            contact_event_id: 'ce',
            provider_id: 'p',
            diagnosis_id: 'd',
            user_id: 'u',
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/job-outcome?token=tk&rating=4' }));
        expect(res.headers.get('location')).toMatch(/thanks\?rating=4/);
    });
});
