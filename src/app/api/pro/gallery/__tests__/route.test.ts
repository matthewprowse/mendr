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

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

function seq(...results: SupabaseQueryResult[]): ChainResolver {
    let i = 0;
    return () => results[Math.min(i++, results.length - 1)];
}

function anon() {
    serverClient = mockSupabaseClient({ user: null });
    adminClient = mockSupabaseClient();
}
function authed(tables: Record<string, SupabaseQueryResult | ChainResolver>) {
    serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
    adminClient = mockSupabaseClient({ tables });
}

const CLAIMED: SupabaseQueryResult = { data: [{ id: 'prov-1' }], error: null };
const OWNER_ROLE: SupabaseQueryResult = { data: { claimed_by_user_id: 'user-1' }, error: null };
function ownerProviders(...tail: SupabaseQueryResult[]) {
    return seq(CLAIMED, OWNER_ROLE, ...tail);
}
function memberTables() {
    return {
        providers: seq({ data: [], error: null }, { data: { claimed_by_user_id: 'other' }, error: null }),
        provider_applications: { data: [], error: null } as SupabaseQueryResult,
        provider_members: seq(
            { data: [{ provider_id: 'prov-1' }], error: null },
            { data: { role: 'member' }, error: null },
        ),
    };
}

beforeEach(() => vi.clearAllMocks());

describe('DELETE /api/pro/gallery', () => {
    it('401 when unauthenticated', async () => {
        anon();
        const { DELETE } = await import('../route');
        const res = await DELETE(makeRequest({ method: 'DELETE', path: '/api/pro/gallery?id=img-1' }));
        expect(res.status).toBe(401);
    });

    it('403 when the user is only a member', async () => {
        authed(memberTables());
        const { DELETE } = await import('../route');
        const res = await DELETE(makeRequest({ method: 'DELETE', path: '/api/pro/gallery?id=img-1' }));
        expect(res.status).toBe(403);
    });

    it('400 when no id is supplied', async () => {
        authed({ providers: ownerProviders() });
        const { DELETE } = await import('../route');
        const res = await DELETE(makeRequest({ method: 'DELETE', path: '/api/pro/gallery' }));
        expect(res.status).toBe(400);
    });

    it('404 when the image does not exist', async () => {
        authed({ providers: ownerProviders(), provider_images: { data: null, error: null } });
        const { DELETE } = await import('../route');
        const res = await DELETE(makeRequest({ method: 'DELETE', path: '/api/pro/gallery?id=img-1' }));
        expect(res.status).toBe(404);
    });

    it('403 when the image belongs to another provider', async () => {
        authed({
            providers: ownerProviders(),
            provider_images: { data: { provider_id: 'other', bucket: 'gallery', path: 'p.jpg' }, error: null },
        });
        const { DELETE } = await import('../route');
        const res = await DELETE(makeRequest({ method: 'DELETE', path: '/api/pro/gallery?id=img-1' }));
        expect(res.status).toBe(403);
    });

    it('deletes an owned image on the happy path', async () => {
        authed({
            providers: ownerProviders(),
            provider_images: seq(
                { data: { provider_id: 'prov-1', bucket: 'gallery', path: 'prov-1/x.jpg' }, error: null },
                { data: null, error: null },
            ),
        });
        const { DELETE } = await import('../route');
        const res = await DELETE(makeRequest({ method: 'DELETE', path: '/api/pro/gallery?id=img-1' }));
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
    });
});
