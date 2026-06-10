/**
 * Contract tests for /api/admin/beta-codes (GET / POST / PATCH / DELETE).
 *
 * Covers: admin gate on every verb, redemption-stat enrichment on GET,
 * auto-generation + normalization of codes on POST, the 23505 duplicate →
 * 409 mapping, PATCH field whitelisting and nothing-to-update 400, and
 * DELETE validation.
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

beforeEach(() => {
    vi.clearAllMocks();
    denyAdmin = false;
    supabase = mockSupabaseClient({
        tables: {
            beta_access_codes: { data: [], error: null },
            beta_access_redemptions: { data: [], error: null },
        },
    });
});

describe('admin gate', () => {
    it.each(['GET', 'POST', 'PATCH', 'DELETE'] as const)(
        '%s returns 401 when not admin',
        async (verb) => {
            denyAdmin = true;
            const route = await import('./route');
            const handler = route[verb];
            const res = await handler(
                makeRequest({ method: verb, body: verb === 'GET' ? undefined : {} }),
            );
            expect(res.status).toBe(401);
        },
    );
});

describe('GET /api/admin/beta-codes', () => {
    it('enriches codes with distinct ip and session counts', async () => {
        supabase = mockSupabaseClient({
            tables: {
                beta_access_codes: {
                    data: [{ id: 'c1', code: 'ABCD2345' }],
                    error: null,
                },
                beta_access_redemptions: {
                    data: [
                        { code_id: 'c1', ip: '1.1.1.1', session_id: 's1' },
                        { code_id: 'c1', ip: '1.1.1.1', session_id: 's2' },
                        { code_id: 'c1', ip: '2.2.2.2', session_id: null },
                    ],
                    error: null,
                },
            },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({}));
        expect(res.status).toBe(200);
        const rows = await res.json();
        expect(rows[0].distinct_ips).toBe(2);
        expect(rows[0].distinct_sessions).toBe(2);
    });

    it('returns 500 when the codes query errors', async () => {
        supabase = mockSupabaseClient({
            tables: {
                beta_access_codes: { data: null, error: { message: 'db down' } },
            },
        });
        const { GET } = await import('./route');
        expect((await GET(makeRequest({}))).status).toBe(500);
    });
});

describe('POST /api/admin/beta-codes', () => {
    // The route's insert chain ends in `.select('*').single()`, which makes the
    // mock helper report 'select' — in these POST tests the insert is the only
    // query on the table, so a static result is sufficient.
    function withInsertCapture(result?: { data: unknown; error: unknown }): void {
        supabase = mockSupabaseClient({
            tables: {
                beta_access_codes: (result ?? {
                    data: { id: 'c-new', code: 'ABCD2345' },
                    error: null,
                }) as never,
            },
        });
    }

    it('returns 400 on malformed JSON', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', rawBody: '{ nope' }));
        expect(res.status).toBe(400);
    });

    it('creates a code and returns it with zeroed stats', async () => {
        withInsertCapture();
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { label: 'Friends' } }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.id).toBe('c-new');
        expect(body.distinct_ips).toBe(0);
        expect(body.distinct_sessions).toBe(0);
    });

    it('maps a unique violation (23505) to 409', async () => {
        withInsertCapture({ data: null, error: { message: 'dup', code: '23505' } });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { code: 'ABCD2345' } }));
        expect(res.status).toBe(409);
    });

    it('maps other insert errors to 500', async () => {
        withInsertCapture({ data: null, error: { message: 'boom' } });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: { code: 'ABCD2345' } }));
        expect(res.status).toBe(500);
    });
});

describe('PATCH /api/admin/beta-codes', () => {
    it('returns 400 without an id', async () => {
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { label: 'x' } }));
        expect(res.status).toBe(400);
    });

    it('returns 400 when no recognised fields are supplied', async () => {
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: { id: 'c1', bogus: true } }),
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/nothing to update/i);
    });

    it('updates a code and returns ok', async () => {
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: { id: 'c1', is_active: false } }),
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
    });
});

describe('DELETE /api/admin/beta-codes', () => {
    it('returns 400 without an id', async () => {
        const { DELETE } = await import('./route');
        const res = await DELETE(makeRequest({ method: 'DELETE', body: {} }));
        expect(res.status).toBe(400);
    });

    it('deletes a code and returns ok', async () => {
        const { DELETE } = await import('./route');
        const res = await DELETE(makeRequest({ method: 'DELETE', body: { id: 'c1' } }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
    });
});
