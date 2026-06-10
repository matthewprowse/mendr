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
            provider_applications: { data: [], error: null, count: 3 },
            contact_messages: { data: [], error: null, count: 5 },
            diagnosis_events: { data: [], error: null, count: 12 },
            reviews: { data: [], error: null, count: 1 },
            provider_images: { data: [], error: null, count: 4 },
        },
    });
});

describe('GET /api/admin/stats', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/stats' }));
        expect(res.status).toBe(401);
    });

    it('returns aggregated stats', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/stats' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('newProviders');
        expect(body).toHaveProperty('unreadMessages');
        expect(body).toHaveProperty('todayStarts');
        expect(body).toHaveProperty('pendingReviews');
        expect(body).toHaveProperty('pendingGallery');
    });
});
