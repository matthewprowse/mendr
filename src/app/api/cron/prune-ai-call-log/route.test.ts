/**
 * Contract tests for /api/cron/prune-ai-call-log (GET and POST).
 *
 * Covers: cron auth gate, dryRun counting (no delete issued), the nothing-
 * to-delete short circuit, the happy delete path, and error surfaces on
 * count/select/delete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    makeRequest,
    mockSupabaseClient,
    type MockSupabaseClient,
} from '@/__tests__/helpers/route-test';

let supabase: MockSupabaseClient;
let cronAuthorized = true;

vi.mock('@/lib/auth/cron-auth', () => ({
    isAuthorizedCronRequest: vi.fn(() => cronAuthorized),
}));

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => supabase),
}));

/**
 * The route hits ai_call_log three times: count (select+head), id select,
 * delete. The mock helper reports the op, so we branch on it; `count` only
 * matters for the first select. We distinguish the count call from the id
 * select via a call counter.
 */
function aiCallLogTable(opts: {
    count?: number | null;
    countError?: string;
    rows?: { id: string }[];
    selectError?: string;
    deleteError?: string;
}) {
    let selectCalls = 0;
    return (_table: string, op: string) => {
        if (op === 'delete') {
            return opts.deleteError
                ? { data: null, error: { message: opts.deleteError } }
                : { data: null, error: null };
        }
        selectCalls += 1;
        if (selectCalls === 1) {
            return opts.countError
                ? { data: null, error: { message: opts.countError }, count: null }
                : { data: null, error: null, count: opts.count ?? 0 };
        }
        return opts.selectError
            ? { data: null, error: { message: opts.selectError } }
            : { data: opts.rows ?? [], error: null };
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    cronAuthorized = true;
    supabase = mockSupabaseClient({
        tables: { ai_call_log: aiCallLogTable({ count: 0, rows: [] }) },
    });
});

describe('auth', () => {
    it('GET returns 401 without the cron secret', async () => {
        cronAuthorized = false;
        const { GET } = await import('./route');
        expect((await GET(makeRequest({}))).status).toBe(401);
    });

    it('POST returns 401 without the cron secret', async () => {
        cronAuthorized = false;
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST' }))).status).toBe(401);
    });
});

describe('dryRun', () => {
    it('reports candidateCount and wouldDelete without deleting', async () => {
        supabase = mockSupabaseClient({
            tables: { ai_call_log: aiCallLogTable({ count: 123 }) },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/prune-ai-call-log?dryRun=true' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toMatchObject({ dryRun: true, candidateCount: 123, wouldDelete: 123 });
    });

    it('caps wouldDelete at the per-run maximum (50000)', async () => {
        supabase = mockSupabaseClient({
            tables: { ai_call_log: aiCallLogTable({ count: 80_000 }) },
        });
        const { GET } = await import('./route');
        const res = await GET(makeRequest({ path: '/api/cron/prune-ai-call-log?dryRun=true' }));
        const body = await res.json();
        expect(body.wouldDelete).toBe(50_000);
    });
});

describe('delete path', () => {
    it('short-circuits when nothing is old enough', async () => {
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.deleted).toBe(0);
    });

    it('deletes the selected batch and reports the count', async () => {
        supabase = mockSupabaseClient({
            tables: {
                ai_call_log: aiCallLogTable({
                    count: 2,
                    rows: [{ id: 'a' }, { id: 'b' }],
                }),
            },
        });
        const { POST } = await import('./route');
        const res = await POST(makeRequest({ method: 'POST' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.deleted).toBe(2);
        expect(body.candidateCount).toBe(2);
    });

    it('returns 500 when the count query fails', async () => {
        supabase = mockSupabaseClient({
            tables: { ai_call_log: aiCallLogTable({ countError: 'count broke' }) },
        });
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST' }))).status).toBe(500);
    });

    it('returns 500 when the id select fails', async () => {
        supabase = mockSupabaseClient({
            tables: { ai_call_log: aiCallLogTable({ count: 5, selectError: 'select broke' }) },
        });
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST' }))).status).toBe(500);
    });

    it('returns 500 when the delete fails', async () => {
        supabase = mockSupabaseClient({
            tables: {
                ai_call_log: aiCallLogTable({
                    count: 1,
                    rows: [{ id: 'a' }],
                    deleteError: 'delete broke',
                }),
            },
        });
        const { POST } = await import('./route');
        expect((await POST(makeRequest({ method: 'POST' }))).status).toBe(500);
    });
});
