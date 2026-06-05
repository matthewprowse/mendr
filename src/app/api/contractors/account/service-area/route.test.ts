import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
    type SupabaseQueryResult,
    type ChainResolver,
} from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
let adminClient: MockSupabaseClient;

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

function seq(...results: SupabaseQueryResult[]): ChainResolver {
    let i = 0;
    return () => results[Math.min(i++, results.length - 1)];
}

// Cape Town — inside the Western Cape bounding box.
const CT = { lat: -33.92, lng: 18.42 };

function anon() {
    serverClient = mockSupabaseClient({ user: null });
    adminClient = mockSupabaseClient();
}
function authed(adminTables: Record<string, SupabaseQueryResult | ChainResolver> = {}) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({ tables: adminTables });
}
const LINKED = { provider_applications: { data: { matched_provider_id: 'prov-1', status: 'approved' }, error: null } };
const UNLINKED = { provider_applications: { data: { matched_provider_id: null, status: 'approved' }, error: null } };

beforeEach(() => vi.clearAllMocks());

describe('GET /api/contractors/account/service-area', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { GET } = await import('./route');
        expect((await GET(makeRequest())).status).toBe(401);
    });

    it('404 when no provider is linked', async () => {
        authed(UNLINKED);
        const { GET } = await import('./route');
        expect((await GET(makeRequest())).status).toBe(404);
    });

    it('returns the service-area config', async () => {
        authed({
            ...LINKED,
            providers: { data: { id: 'prov-1', name: 'Acme', latitude: -33.9, longitude: 18.4, service_area_center_lat: -33.92, service_area_center_lng: 18.42, service_area_radius_km: 25 }, error: null },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.providerId).toBe('prov-1');
        expect(body.serviceArea.radiusKm).toBe(25);
    });
});

describe('POST /api/contractors/account/service-area', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { ...CT, radiusKm: 15 } }))).status).toBe(401);
    });

    it('400 when lat/lng/radius are missing', async () => {
        authed();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: {} }))).status).toBe(400);
    });

    it('400 when the radius is out of range', async () => {
        authed();
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { ...CT, radiusKm: 999 } }))).status).toBe(400);
    });

    it('400 when the centre is outside the Western Cape', async () => {
        authed();
        const { POST } = await import('./route');
        // Johannesburg — well outside the WC box
        expect((await POST(makeRequest({ method: 'POST', body: { lat: -26.2, lng: 28.0, radiusKm: 15 } }))).status).toBe(400);
    });

    it('404 when no provider is linked', async () => {
        authed(UNLINKED);
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST', body: { ...CT, radiusKm: 15 } }))).status).toBe(404);
    });

    it('409 when the radius exceeds the plan limit', async () => {
        authed({ ...LINKED, providers: { data: { plan: 'starter' }, error: null } });
        const { POST } = await import('./route');
        // starter caps at 20 km
        const res = await POST(makeRequest({ method: 'POST', body: { ...CT, radiusKm: 40 } }));
        expect(res.status).toBe(409);
    });

    it('saves the service area on the happy path', async () => {
        authed({ ...LINKED, providers: seq({ data: { plan: 'business' }, error: null }, { data: null, error: null }) });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { ...CT, radiusKm: 40 } }));
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
    });
});
