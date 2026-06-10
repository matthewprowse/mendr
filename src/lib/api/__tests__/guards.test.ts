import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { mockSupabaseClient, makeRequest, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
let adminClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

vi.mock('@/lib/diagnosis/ownership', () => ({
    resolveDiagnosisIdentity: vi.fn(async () => ({ userId: null, anonKey: null })),
    ownsDiagnosis: vi.fn(() => false),
}));

beforeEach(() => {
    vi.clearAllMocks();
    serverClient = mockSupabaseClient({ user: null });
    adminClient = mockSupabaseClient({});
});

describe('requireUser (M12)', () => {
    it('returns 401 for an anonymous caller', async () => {
        const { requireUser } = await import('../guards');
        const res = await requireUser();
        expect(res).toBeInstanceOf(NextResponse);
        expect((res as NextResponse).status).toBe(401);
    });

    it('returns the userId for a signed-in caller', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'u1' } });
        const { requireUser } = await import('../guards');
        const res = await requireUser();
        expect(res).toEqual({ userId: 'u1' });
    });
});

describe('requireProvider (M12)', () => {
    it('403 when the user does not own the provider', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'u1' } });
        adminClient = mockSupabaseClient({ tables: { provider_applications: { data: null, error: null } } });
        const { requireProvider } = await import('../guards');
        const res = await requireProvider('p1');
        expect((res as NextResponse).status).toBe(403);
    });

    it('grants when the user owns the provider', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'u1' } });
        adminClient = mockSupabaseClient({ tables: { provider_applications: { data: { id: 'app1' }, error: null } } });
        const { requireProvider } = await import('../guards');
        const res = await requireProvider('p1');
        expect(res).toEqual({ userId: 'u1', providerId: 'p1' });
    });
});

describe('requireUser — throws path', () => {
    it('returns 401 when createSupabaseServerClient throws', async () => {
        const { createSupabaseServerClient } = await import('@/lib/auth/supabase-server');
        vi.mocked(createSupabaseServerClient).mockRejectedValueOnce(new Error('SSR context unavailable'));
        const { requireUser } = await import('../guards');
        const res = await requireUser();
        expect(res).toBeInstanceOf(NextResponse);
        expect((res as NextResponse).status).toBe(401);
    });
});

describe('withAuth (M12)', () => {
    it('short-circuits anonymous callers with 401', async () => {
        const { withAuth } = await import('../guards');
        const handler = vi.fn(async () => NextResponse.json({ ok: true }));
        const wrapped = withAuth(handler);
        const res = await wrapped(makeRequest());
        expect(res.status).toBe(401);
        expect(handler).not.toHaveBeenCalled();
    });

    it('runs the handler with the user context when signed in', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'u9' } });
        const { withAuth } = await import('../guards');
        const wrapped = withAuth(async (_req, ctx) => NextResponse.json({ uid: ctx.userId }));
        const res = await wrapped(makeRequest());
        expect(res.status).toBe(200);
        expect((await res.json()).uid).toBe('u9');
    });
});

describe('requireOwnedDiagnosis (M12)', () => {
    it('returns 404 when no diagnosis row exists (data=null)', async () => {
        const { resolveDiagnosisIdentity } = await import('@/lib/diagnosis/ownership');
        vi.mocked(resolveDiagnosisIdentity).mockResolvedValueOnce({ userId: 'u1', anonKey: null });
        adminClient = mockSupabaseClient({ tables: { diagnoses: { data: null, error: null } } });
        const { requireOwnedDiagnosis } = await import('../guards');
        const req = makeRequest({ method: 'GET', path: '/api/diagnoses/d1' });
        const res = await requireOwnedDiagnosis(req, 'd1');
        expect(res).toBeInstanceOf(NextResponse);
        expect((res as NextResponse).status).toBe(404);
    });

    it('returns 404 when ownsDiagnosis returns false (different user)', async () => {
        const { resolveDiagnosisIdentity } = await import('@/lib/diagnosis/ownership');
        // Identity userId=u-other, but diagnosis belongs to u2 → ownsDiagnosis false
        vi.mocked(resolveDiagnosisIdentity).mockResolvedValueOnce({ userId: 'u-other', anonKey: null });
        adminClient = mockSupabaseClient({
            tables: { diagnoses: { data: { user_id: 'u2', anon_key: null }, error: null } },
        });
        const { requireOwnedDiagnosis } = await import('../guards');
        const req = makeRequest({ method: 'GET', path: '/api/diagnoses/d2' });
        const res = await requireOwnedDiagnosis(req, 'd2');
        // ownsDiagnosis mock returns false → 404
        expect(res).toBeInstanceOf(NextResponse);
        expect((res as NextResponse).status).toBe(404);
    });
});
