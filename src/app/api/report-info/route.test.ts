import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => supabase),
}));

beforeEach(() => {
    vi.clearAllMocks();
    supabase = mockSupabaseClient({
        tables: {
            diagnoses: {
                data: {
                    id: 'conv-1',
                    diagnosis: { diagnosis: 'Burst pipe', trade: 'Plumbing' },
                    initial_image_description: 'water leaking',
                    is_direct_match: false,
                },
                error: null,
            },
        },
    });
});

describe('GET /api/report-info', () => {
    it('returns 400 when conversation_id missing', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/report-info' }));
        expect(res.status).toBe(400);
    });

    it('returns diagnosis + trade + report_url on happy path', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/report-info?conversation_id=conv-1' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.diagnosis).toBe('Burst pipe');
        expect(body.trade).toBe('Plumbing');
        expect(body.report_url).toMatch(/\/report\/conv-1$/);
    });

    it('returns 404 when conversation not found', async () => {
        supabase = mockSupabaseClient({
            tables: { diagnoses: { data: null, error: null } },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/report-info?conversation_id=missing' }));
        expect(res.status).toBe(404);
    });

    it('falls back to initial_image_description for direct-match users', async () => {
        supabase = mockSupabaseClient({
            tables: {
                diagnoses: {
                    data: {
                        id: 'd1',
                        diagnosis: null,
                        initial_image_description: 'broken tap',
                        is_direct_match: true,
                    },
                    error: null,
                },
            },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/report-info?conversation_id=d1' }));
        const body = await res.json();
        expect(body.diagnosis).toBe('broken tap');
        expect(body.is_direct_match).toBe(true);
    });

    it('returns 429 when rate-limited', async () => {
        const { NextResponse } = await import('next/server');
        const rateLimitConfig = await import('@/lib/rate-limit-config');
        vi.mocked(rateLimitConfig.checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: 'rl' }, { status: 429 }),
        );
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/report-info?conversation_id=x' }));
        expect(res.status).toBe(429);
    });
});
