/**
 * Contract tests for GET /api/diagnoses/[id]/cost-estimate.
 *
 * The route is deliberately soft-fail: every internal problem returns
 * { estimate: null } with HTTP 200 so the diagnosis page never breaks.
 * Covers: id validation, rate limit, missing GEMINI_API_KEY, stored-estimate
 * reuse (no regeneration), the non-diagnosis guards (rejected/unserviced/
 * clarification/empty), generation + best-effort persistence, and generation
 * failure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
} from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
let rateLimited = false;

const generateCostEstimate = vi.fn();

vi.mock('@/lib/rate-limit-config', () => ({
    checkRateLimit: vi.fn(async () => {
        if (rateLimited) {
            const { NextResponse } = await import('next/server');
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }
        return null;
    }),
}));

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

vi.mock('@/lib/cost/estimate-cost', () => ({
    generateCostEstimate: (...args: unknown[]) => generateCostEstimate(...(args as [])),
}));

const ID = '123e4567-e89b-12d3-a456-426614174000';
const STORED_ESTIMATE = {
    line_items: [{ label: 'Replace valve', min: 500, max: 1500 }],
};

function withDiagnosis(diagnosis: Record<string, unknown> | null): void {
    supabase = mockSupabaseClient({
        tables: {
            diagnoses: (_t, op) =>
                op === 'update'
                    ? { data: null, error: null }
                    : { data: diagnosis === null ? null : { id: ID, diagnosis }, error: null },
        },
    });
}

function call(id = ID): Promise<Response> {
    return import('./route').then(({ GET }) =>
        GET(makeRequest({}), { params: Promise.resolve({ id }) }),
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    rateLimited = false;
    process.env.GEMINI_API_KEY = 'test-key';
    generateCostEstimate.mockResolvedValue(STORED_ESTIMATE);
    withDiagnosis({ diagnosis: 'Leaking geyser valve', message: 'detail' });
});

afterEach(() => {
    delete process.env.GEMINI_API_KEY;
});

describe('GET /api/diagnoses/[id]/cost-estimate — gates', () => {
    it('returns 400 for a non-UUID id', async () => {
        const res = await call('nope');
        expect(res.status).toBe(400);
    });

    it('returns 429 when rate limited', async () => {
        rateLimited = true;
        const res = await call();
        expect(res.status).toBe(429);
    });

    it('returns null estimate when GEMINI_API_KEY is unset', async () => {
        delete process.env.GEMINI_API_KEY;
        const res = await call();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ estimate: null });
        expect(generateCostEstimate).not.toHaveBeenCalled();
    });
});

describe('GET /api/diagnoses/[id]/cost-estimate — stored and guarded paths', () => {
    it('returns the stored estimate without regenerating', async () => {
        withDiagnosis({
            diagnosis: 'Leaking geyser valve',
            cost_estimate: STORED_ESTIMATE,
        });
        const res = await call();
        expect(res.status).toBe(200);
        expect((await res.json()).estimate).toEqual(STORED_ESTIMATE);
        expect(generateCostEstimate).not.toHaveBeenCalled();
    });

    it('returns null for an unknown diagnosis row', async () => {
        withDiagnosis(null);
        const res = await call();
        expect(await res.json()).toEqual({ estimate: null });
    });

    it.each([
        ['rejected', { diagnosis: 'x'.repeat(10), rejected: true }],
        ['unserviced', { diagnosis: 'x'.repeat(10), unserviced: true }],
        ['clarification', { diagnosis: 'x'.repeat(10), requires_clarification: true }],
        ['empty title', { diagnosis: '   ' }],
    ])('returns null for a %s diagnosis', async (_label, diag) => {
        withDiagnosis(diag as Record<string, unknown>);
        const res = await call();
        expect(await res.json()).toEqual({ estimate: null });
        expect(generateCostEstimate).not.toHaveBeenCalled();
    });
});

describe('GET /api/diagnoses/[id]/cost-estimate — generation', () => {
    it('generates, persists, and returns a fresh estimate', async () => {
        const res = await call();
        expect(res.status).toBe(200);
        expect((await res.json()).estimate).toEqual(STORED_ESTIMATE);
        expect(generateCostEstimate).toHaveBeenCalledWith(
            expect.objectContaining({ conversationId: ID, title: 'Leaking geyser valve' }),
        );
    });

    it('returns null when generation fails', async () => {
        generateCostEstimate.mockResolvedValue(null);
        const res = await call();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ estimate: null });
    });
});
