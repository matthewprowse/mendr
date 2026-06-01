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

vi.mock('@/lib/rate-limit-config', () => ({
    checkRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

function diagRow(opts: {
    created_at: string;
    trade?: string | null;
    funnel?: { delivered_at: string | null; matches_shown_at: string | null; first_contact_at: string | null };
}) {
    return {
        created_at: opts.created_at,
        diagnosis: opts.trade ? { trade: opts.trade } : null,
        diagnosis_funnel: opts.funnel ? [opts.funnel] : [],
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    denyAdmin = false;
    supabase = mockSupabaseClient({
        tables: {
            diagnosis_funnel: { data: { created_at: '2026-05-01T00:00:00.000Z' }, error: null },
            diagnoses: {
                data: [
                    diagRow({
                        created_at: '2026-05-10T10:00:00.000Z',
                        trade: 'Plumbing',
                        funnel: {
                            delivered_at: '2026-05-10T10:01:00.000Z',
                            matches_shown_at: '2026-05-10T10:05:00.000Z',
                            first_contact_at: '2026-05-10T10:20:00.000Z',
                        },
                    }),
                    diagRow({
                        created_at: '2026-05-11T10:00:00.000Z',
                        trade: 'Plumbing',
                        funnel: { delivered_at: '2026-05-11T10:01:00.000Z', matches_shown_at: null, first_contact_at: null },
                    }),
                    diagRow({
                        created_at: '2026-05-12T10:00:00.000Z',
                        trade: 'Electrical',
                        funnel: { delivered_at: '2026-05-12T10:01:00.000Z', matches_shown_at: '2026-05-12T10:03:00.000Z', first_contact_at: null },
                    }),
                ],
                error: null,
            },
        },
    });
});

describe('GET /api/admin/funnel', () => {
    it('returns 401 when not admin', async () => {
        denyAdmin = true;
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/funnel' }));
        expect(res.status).toBe(401);
    });

    it('returns durable funnel stages, breakdown and tracking_since', async () => {
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/admin/funnel' }));
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body.totalDiagnoses).toBe(3);
        const byKey = Object.fromEntries(body.stages.map((s: { key: string; count: number }) => [s.key, s.count]));
        expect(byKey).toEqual({ started: 3, delivered: 3, matches_shown: 2, contacted: 1 });

        expect(body.trackingSince).toBe('2026-05-01T00:00:00.000Z');
        expect(body.medianMinutesToContact).toBe(20);
        expect(body.tradeBreakdown[0].trade).toBe('Plumbing');
    });
});
