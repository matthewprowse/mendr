/**
 * Contract tests for POST /api/diagnose/refinement.
 *
 * Covers: validation (missing/bad conversationId), kill-switch no-op,
 * fail-open behaviour (admin client failure, unknown conversation, update
 * failure), the cap at REFINEMENT_LIMIT, and the happy increment path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
} from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
let adminClientThrows = false;
let killSwitch = false;
let bypassed = false;

vi.mock('@/lib/rate-limit-config', () => ({
    checkRateLimit: vi.fn(async () => null),
    killSwitchActive: vi.fn(() => killSwitch),
    isRateLimitBypassed: vi.fn(() => bypassed),
}));

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => {
        if (adminClientThrows) throw new Error('no admin client');
        return supabase;
    }),
}));

const VALID_ID = '123e4567-e89b-42d3-a456-426614174000';

function diagnosesTable(refinementCount: number | null) {
    return (_table: string, op: string) => {
        if (op === 'update') return { data: null, error: null };
        return { data: { refinement_count: refinementCount }, error: null };
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    adminClientThrows = false;
    killSwitch = false;
    bypassed = false;
    supabase = mockSupabaseClient({
        tables: { diagnoses: diagnosesTable(0) },
    });
});

describe('POST /api/diagnose/refinement — validation', () => {
    it('returns 400 when conversationId is missing', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST', body: {} }));
        expect(res.status).toBe(400);
    });

    it('returns 400 when conversationId is not a UUID', async () => {
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { conversationId: 'not-a-uuid' } }),
        );
        expect(res.status).toBe(400);
    });
});

describe('POST /api/diagnose/refinement — kill switch and fail-open', () => {
    it('no-ops (ok, uncapped) when the kill switch is active', async () => {
        killSwitch = true;
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { conversationId: VALID_ID } }),
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, capped: false });
    });

    it('no-ops when the caller is rate-limit bypassed', async () => {
        bypassed = true;
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { conversationId: VALID_ID } }),
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, capped: false });
    });

    it('fails open when the admin client cannot be created', async () => {
        adminClientThrows = true;
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { conversationId: VALID_ID } }),
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, capped: false });
    });

    it('fails open for an unknown conversation', async () => {
        supabase = mockSupabaseClient({
            tables: { diagnoses: { data: null, error: null } },
        });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { conversationId: VALID_ID } }),
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, capped: false });
    });

    it('fails open when the count update errors', async () => {
        supabase = mockSupabaseClient({
            tables: {
                diagnoses: (_t, op) =>
                    op === 'update'
                        ? { data: null, error: { message: 'update failed' } }
                        : { data: { refinement_count: 3 }, error: null },
            },
        });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { conversationId: VALID_ID } }),
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, capped: false });
    });
});

describe('POST /api/diagnose/refinement — cap and increment', () => {
    it('returns 429 once the limit (10) is reached', async () => {
        supabase = mockSupabaseClient({
            tables: { diagnoses: diagnosesTable(10) },
        });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { conversationId: VALID_ID } }),
        );
        expect(res.status).toBe(429);
        const body = await res.json();
        expect(body.error).toBe('refinement_limit');
        expect(body.limit).toBe(10);
        expect(body.used).toBe(10);
    });

    it('increments and returns used/limit on the happy path', async () => {
        supabase = mockSupabaseClient({
            tables: { diagnoses: diagnosesTable(4) },
        });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { conversationId: VALID_ID } }),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ ok: true, capped: false, used: 5, limit: 10 });
    });

    it('treats a null refinement_count as 0', async () => {
        supabase = mockSupabaseClient({
            tables: { diagnoses: diagnosesTable(null) },
        });
        const { POST } = await import('./route');
        const res = await POST(
            makeRequest({ method: 'POST', body: { conversationId: VALID_ID } }),
        );
        const body = await res.json();
        expect(body.used).toBe(1);
    });
});
