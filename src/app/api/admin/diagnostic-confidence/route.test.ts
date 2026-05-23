import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest, mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
let denyAdmin = false;

vi.mock('@/lib/auth/admin-auth', () => ({
    requireAdmin: vi.fn(async () => {
        if (denyAdmin) {
            const { NextResponse } = await import('next/server');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return null;
    }),
}));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

beforeEach(() => {
    vi.clearAllMocks();
    denyAdmin = false;
    supabase = mockSupabaseClient({
        tables: {
            diagnoses: {
                data: [
                    {
                        id: 'd1',
                        created_at: '2026-05-20',
                        diagnosis: {
                            structural_confidence: {
                                score: 50,
                                signals: {
                                    hasImage: false,
                                    imageCount: 0,
                                    descriptionWordCount: 12,
                                    subcategoryMatched: false,
                                    failedComponentNamed: false,
                                    isCatchAllWithNoVisual: false,
                                    isRejectedOrUnserviced: false,
                                },
                            },
                        },
                    },
                ],
                error: null,
            },
        },
    });
});

describe('GET /api/admin/diagnostic-confidence', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/diagnostic-confidence' }));
        expect(res.status).toBe(401);
    });

    it('returns aggregated histogram + top signals', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/diagnostic-confidence' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('threshold');
        expect(body).toHaveProperty('sampleSize');
        expect(body).toHaveProperty('histogram');
        expect(body).toHaveProperty('topBelowSignals');
    });

    it('clamps limit to MAX_LIMIT (1000)', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/diagnostic-confidence?limit=999999' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.requestedLimit).toBeLessThanOrEqual(1000);
    });

    it('returns 500 on DB error', async () => {
        supabase = mockSupabaseClient({
            tables: { diagnoses: { data: null, error: { message: 'db' } } },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/diagnostic-confidence' }));
        expect(res.status).toBe(500);
    });
});
