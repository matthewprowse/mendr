/**
 * Contract tests for /api/admin/providers/live.
 *
 * The route is long (312 lines) and covers admin-only listing + mutation of
 * live provider profiles. We pin the auth gate + the high-level GET shape;
 * the deeper field-level merge logic is exercised by the provider lib unit
 * tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
} from '@/__tests__/helpers/route-test';

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
vi.mock('@/lib/providers/refresh-provider-by-place-id', () => ({
    refreshProviderByPlaceId: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/certifications/catalog', () => ({
    CERTIFICATION_SLUGS: new Set(['plumbing']),
    getCertificationBySlug: () => ({ slug: 'plumbing', label: 'Plumbing' }),
}));

beforeEach(() => {
    vi.clearAllMocks();
    denyAdmin = false;
    supabase = mockSupabaseClient({
        tables: {
            providers: { data: [{ id: 'p1', name: 'Acme' }], error: null },
            diagnosis_events: { data: [], error: null },
            provider_certifications: { data: [], error: null },
        },
    });
});

describe('GET /api/admin/providers/live', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/providers/live' }));
        expect(res.status).toBe(401);
    });

    it('returns provider list on success', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/providers/live' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
    });

    it('returns 500 when DB errors', async () => {
        supabase = mockSupabaseClient({
            tables: {
                providers: { data: null, error: { message: 'db' } },
                diagnosis_events: { data: [], error: null },
                provider_certifications: { data: [], error: null },
            },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/providers/live' }));
        expect(res.status).toBe(500);
    });
});

describe('POST/PATCH /api/admin/providers/live — auth gate', () => {
    it('POST returns 401 when not admin', async () => {
        denyAdmin = true;
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(401);
    });

    it('PATCH returns 401 when not admin', async () => {
        denyAdmin = true;
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: {} }));
        expect(res.status).toBe(401);
    });
});

describe('POST /api/admin/providers/live — add by place id', () => {
    it('adds a provider from a place id', async () => {
        const { refreshProviderByPlaceId } =
            await import('@/lib/providers/refresh-provider-by-place-id');
        vi.mocked(refreshProviderByPlaceId).mockResolvedValueOnce({
            ok: true,
            providerId: 'new-id',
            provider: { name: 'Fresh Co', address: '1 Road' },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { place_id: 'ChIJabc' } }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toMatchObject({ ok: true, id: 'new-id', name: 'Fresh Co' });
    });

    it('returns 502 when the Google fetch fails', async () => {
        const { refreshProviderByPlaceId } =
            await import('@/lib/providers/refresh-provider-by-place-id');
        vi.mocked(refreshProviderByPlaceId).mockResolvedValueOnce({
            ok: false,
            error: 'no key',
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { place_id: 'ChIJabc' } }));
        expect(res.status).toBe(502);
    });
});

describe('DELETE /api/admin/providers/live', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { DELETE } = await import('./route');
        const res = await DELETE(
            makeRequest({ method: 'DELETE', path: '/api/admin/providers/live?id=p1' }),
        );
        expect(res.status).toBe(401);
    });

    it('returns 400 when id missing', async () => {
        const { DELETE } = await import('./route');
        const res = await DELETE(
            makeRequest({ method: 'DELETE', path: '/api/admin/providers/live' }),
        );
        expect(res.status).toBe(400);
    });

    it('returns ok on success', async () => {
        const { DELETE } = await import('./route');
        const res = await DELETE(
            makeRequest({ method: 'DELETE', path: '/api/admin/providers/live?id=p1' }),
        );
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
    });

    it('returns 500 when the delete errors', async () => {
        supabase = mockSupabaseClient({
            tables: { providers: { data: null, error: { message: 'db' } } },
        });
        const { DELETE } = await import('./route');
        const res = await DELETE(
            makeRequest({ method: 'DELETE', path: '/api/admin/providers/live?id=p1' }),
        );
        expect(res.status).toBe(500);
    });
});
