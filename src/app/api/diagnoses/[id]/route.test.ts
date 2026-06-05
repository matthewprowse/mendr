import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
    type SupabaseQueryResult,
} from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
let authUser: { id: string } | null = null;
const VALID_UUID = '11111111-2222-3333-4444-555555555555';
const OWNER = 'owner-user-1';
const ANON_KEY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

vi.mock('@/lib/rate-limit-config', () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
    createSupabaseServerClient: vi.fn(async () => mockSupabaseClient({ user: authUser })),
}));

function ctx(id: string) {
    return { params: Promise.resolve({ id }) };
}

/** A diagnoses table resolver that returns each result in order across the
 *  sequence of terminal calls the route makes (ownership SELECT, then UPDATE). */
function seq(...results: SupabaseQueryResult[]) {
    let i = 0;
    return () => results[Math.min(i++, results.length - 1)];
}

beforeEach(() => {
    vi.clearAllMocks();
    authUser = null;
});

describe('GET /api/diagnoses/[id]', () => {
    it('returns 400 on invalid id', async () => {
        supabase = mockSupabaseClient({ tables: { diagnoses: { data: null, error: null } } });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/diagnoses/bad' }), ctx('bad'));
        expect(res.status).toBe(400);
    });

    it('returns data to the authenticated owner', async () => {
        authUser = { id: OWNER };
        supabase = mockSupabaseClient({
            tables: {
                diagnoses: {
                    data: { id: VALID_UUID, image_urls: ['https://a/1.jpg'], user_id: OWNER, anon_key: null },
                    error: null,
                },
            },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: `/api/diagnoses/${VALID_UUID}` }), ctx(VALID_UUID));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.id).toBe(VALID_UUID);
        expect(Array.isArray(body.data.imageUrls)).toBe(true);
        // Internal owner columns must not leak to the client.
        expect(body.data.user_id).toBeUndefined();
        expect(body.data.anon_key).toBeUndefined();
    });

    it('returns data to the anonymous owner holding the matching cookie', async () => {
        supabase = mockSupabaseClient({
            tables: {
                diagnoses: {
                    data: { id: VALID_UUID, image_urls: [], user_id: null, anon_key: ANON_KEY },
                    error: null,
                },
            },
        });
        const { GET } = await import('./route');
        const res = await GET(
            makeRequest({ path: `/api/diagnoses/${VALID_UUID}`, cookies: { scandio_anon: ANON_KEY } }),
            ctx(VALID_UUID),
        );
        expect(res.status).toBe(200);
    });

    it('returns 404 when the row is owned by someone else (IDOR)', async () => {
        authUser = { id: 'intruder' };
        supabase = mockSupabaseClient({
            tables: {
                diagnoses: {
                    data: { id: VALID_UUID, customer_address: '1 Secret St', user_id: OWNER, anon_key: null },
                    error: null,
                },
            },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: `/api/diagnoses/${VALID_UUID}` }), ctx(VALID_UUID));
        expect(res.status).toBe(404);
    });

    it('returns null data (200) when the row does not exist yet', async () => {
        supabase = mockSupabaseClient({ tables: { diagnoses: { data: null, error: null } } });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: `/api/diagnoses/${VALID_UUID}` }), ctx(VALID_UUID));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data).toBeNull();
    });

    it('returns 500 on DB error', async () => {
        supabase = mockSupabaseClient({ tables: { diagnoses: { data: null, error: { message: 'db' } } } });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: `/api/diagnoses/${VALID_UUID}` }), ctx(VALID_UUID));
        expect(res.status).toBe(500);
    });
});

describe('PATCH /api/diagnoses/[id]', () => {
    it('returns 400 on invalid id', async () => {
        supabase = mockSupabaseClient({ tables: { diagnoses: { data: null, error: null } } });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: { title: 'x' } }), ctx('bad'));
        expect(res.status).toBe(400);
    });

    it('returns 400 on malformed JSON', async () => {
        supabase = mockSupabaseClient({ tables: { diagnoses: { data: null, error: null } } });
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: undefined, rawBody: 'nope' }),
            ctx(VALID_UUID),
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when no valid fields supplied', async () => {
        supabase = mockSupabaseClient({ tables: { diagnoses: { data: null, error: null } } });
        const { PATCH } = await import('./route');
        const res = await PATCH(makeRequest({ method: 'PATCH', body: {} }), ctx(VALID_UUID));
        expect(res.status).toBe(400);
    });

    it('updates an existing row for its owner', async () => {
        authUser = { id: OWNER };
        supabase = mockSupabaseClient({
            tables: {
                diagnoses: seq(
                    { data: { user_id: OWNER, anon_key: null }, error: null }, // ownership SELECT
                    { data: [{ id: VALID_UUID }], error: null }, // UPDATE .select('id')
                ),
            },
        });
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: { title: 'Updated' } }),
            ctx(VALID_UUID),
        );
        expect(res.status).toBe(200);
    });

    it('refuses to update a row owned by someone else (IDOR)', async () => {
        authUser = { id: 'intruder' };
        supabase = mockSupabaseClient({
            tables: { diagnoses: { data: { user_id: OWNER, anon_key: null }, error: null } },
        });
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: { customer_address: 'hijack' } }),
            ctx(VALID_UUID),
        );
        expect(res.status).toBe(404);
    });

    it('ignores a client-supplied user_id and forces the session user on insert', async () => {
        authUser = { id: OWNER };
        let inserted: Record<string, unknown> | null = null;
        supabase = mockSupabaseClient({ tables: { diagnoses: { data: null, error: null } } });
        // Capture the inserted row to assert user_id is server-derived.
        const realFrom = supabase.from;
        supabase.from = vi.fn((table: string) => {
            const builder = realFrom(table) as Record<string, unknown> & {
                insert: (row: Record<string, unknown>) => unknown;
            };
            const origInsert = builder.insert;
            builder.insert = vi.fn((row: Record<string, unknown>) => {
                inserted = row;
                return (origInsert as (r: Record<string, unknown>) => unknown)(row);
            });
            return builder;
        }) as typeof supabase.from;

        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: { title: 'New', user_id: 'attacker-supplied' } }),
            ctx(VALID_UUID),
        );
        expect(res.status).toBe(200);
        expect(inserted).not.toBeNull();
        expect((inserted as unknown as { user_id: string }).user_id).toBe(OWNER);
    });

    it('mints a scandio_anon cookie when an anonymous caller creates a row', async () => {
        authUser = null;
        supabase = mockSupabaseClient({ tables: { diagnoses: { data: null, error: null } } });
        const { PATCH } = await import('./route');
        const res = await PATCH(
            makeRequest({ method: 'PATCH', body: { title: 'New' } }),
            ctx(VALID_UUID),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('set-cookie') || '').toContain('scandio_anon=');
    });
});
