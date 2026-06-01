import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DataForSEOReview } from '@/lib/providers/dataforseo-client';

// ---------------------------------------------------------------------------
// Supabase admin-client mock — fluent chain we can program per-test.
// ---------------------------------------------------------------------------

interface CallRecord {
    table: string;
    op: 'select' | 'upsert' | 'update' | 'delete' | 'eq' | 'in' | 'order' | 'limit';
    args?: unknown[];
}

interface MockState {
    selectCounts: number[]; // queue of values returned for `.select().eq('provider_id', x)` count queries
    upsertResult: { data: Array<{ id: string }> | null; error: { message: string } | null };
    cacheUpdateError: { message: string } | null;
    providerUpdateError: { message: string } | null;
    calls: CallRecord[];
    // Captured payloads so tests can inspect them.
    upsertedRows: Array<Record<string, unknown>> | null;
    cacheUpdatePayload: Record<string, unknown> | null;
}

const state: MockState = {
    selectCounts: [],
    upsertResult: { data: [], error: null },
    cacheUpdateError: null,
    providerUpdateError: null,
    calls: [],
    upsertedRows: null,
    cacheUpdatePayload: null,
};

function resetState() {
    state.selectCounts = [];
    state.upsertResult = { data: [], error: null };
    state.cacheUpdateError = null;
    state.providerUpdateError = null;
    state.calls = [];
    state.upsertedRows = null;
    state.cacheUpdatePayload = null;
}

function makeAdminClient() {
    function from(table: string) {
        const builder = {
            _table: table,
            _filters: {} as Record<string, unknown>,
            select(_cols?: string, opts?: { count?: 'exact'; head?: boolean }) {
                state.calls.push({ table, op: 'select', args: [opts] });
                // count query — terminal-style: return await-able with { count }.
                const isCount = opts?.count === 'exact';
                const proxy: Record<string, unknown> = {
                    eq(_col: string, _val: string) {
                        state.calls.push({ table, op: 'eq', args: [_col, _val] });
                        if (isCount) {
                            const next = state.selectCounts.shift() ?? 0;
                            return Promise.resolve({ count: next, error: null });
                        }
                        return proxy;
                    },
                    order(_col: string, _opts: unknown) {
                        state.calls.push({ table, op: 'order', args: [_col, _opts] });
                        return proxy;
                    },
                    limit(_n: number) {
                        state.calls.push({ table, op: 'limit', args: [_n] });
                        // Resolve to `{ data: [{ id }] }` for the prune query.
                        const data = state.upsertedRows
                            ? // re-use upserted rows as "oldest" surrogate when tests want it
                              state.upsertedRows.slice(0, _n).map((_, i) => ({ id: `old-${i}` }))
                            : [];
                        return Promise.resolve({ data, error: null });
                    },
                };
                return proxy;
            },
            upsert(rows: Array<Record<string, unknown>> | Record<string, unknown>, _opts: unknown) {
                // provider_cache upserts a single object and is awaited directly
                // (no chained .select()); reviews upserts an array and chains .select().
                if (table === 'provider_cache') {
                    state.calls.push({ table, op: 'upsert', args: [1] });
                    state.cacheUpdatePayload = rows as Record<string, unknown>;
                    return Promise.resolve({ error: state.cacheUpdateError });
                }
                const arr = rows as Array<Record<string, unknown>>;
                state.calls.push({ table, op: 'upsert', args: [arr.length] });
                state.upsertedRows = arr;
                return {
                    select(_cols?: string) {
                        return Promise.resolve(state.upsertResult);
                    },
                };
            },
            update(payload: Record<string, unknown>) {
                state.calls.push({ table, op: 'update', args: [payload] });
                if (table === 'provider_cache') state.cacheUpdatePayload = payload;
                return {
                    eq(_col: string, _val: string) {
                        if (table === 'provider_cache') {
                            return Promise.resolve({ error: state.cacheUpdateError });
                        }
                        if (table === 'providers') {
                            // The route uses `.then` rather than `await` — Promise-shape works.
                            return Promise.resolve({ error: state.providerUpdateError });
                        }
                        return Promise.resolve({ error: null });
                    },
                };
            },
            delete() {
                state.calls.push({ table, op: 'delete' });
                return {
                    in(_col: string, _ids: string[]) {
                        return Promise.resolve({ error: null });
                    },
                };
            },
        };
        return builder;
    }
    return { from };
}

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: async () => makeAdminClient(),
}));

// Suppress noisy structured-log writes the implementation emits on the happy path.
beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeReview(overrides: Partial<DataForSEOReview> = {}): DataForSEOReview {
    return {
        review_url: 'https://maps.google.com/review/abc',
        rating: 5,
        review_text: 'Great service, very prompt and tidy.',
        reviewer_name: 'Jane Doe',
        timestamp: '2025-06-01T00:00:00Z',
        ...overrides,
    };
}

const PROVIDER_ID = 'prov-1';
const PLACE_ID = 'ChIJxxx';

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe('ingestDataForSEOReviews', () => {
    beforeEach(() => resetState());

    it('returns zeroes when no reviews supplied', async () => {
        state.selectCounts = [3]; // countBefore
        const { ingestDataForSEOReviews } = await import('../review-ingestion');
        const result = await ingestDataForSEOReviews(PROVIDER_ID, PLACE_ID, []);
        expect(result).toEqual({
            added: 0,
            unchanged: 0,
            reviewCountBefore: 3,
            reviewCountAfter: 3,
        });
    });

    it('filters out reviews older than 3 years', async () => {
        state.selectCounts = [0]; // countBefore
        const stale = makeReview({
            review_url: 'https://maps.google.com/review/stale',
            timestamp: '2020-01-01T00:00:00Z',
        });
        const { ingestDataForSEOReviews } = await import('../review-ingestion');
        const result = await ingestDataForSEOReviews(PROVIDER_ID, PLACE_ID, [stale]);
        // All reviews filtered out -> early return, no upsert call.
        expect(result.added).toBe(0);
        expect(result.unchanged).toBe(0);
        const upsertCalls = state.calls.filter((c) => c.op === 'upsert');
        expect(upsertCalls).toHaveLength(0);
    });

    it('keeps reviews with no timestamp', async () => {
        state.selectCounts = [0, 1];
        state.upsertResult = { data: [{ id: 'new-1' }], error: null };
        const undated = makeReview({ timestamp: null, review_url: 'https://maps.google.com/x' });
        const { ingestDataForSEOReviews } = await import('../review-ingestion');
        const result = await ingestDataForSEOReviews(PROVIDER_ID, PLACE_ID, [undated]);
        expect(result.added).toBe(1);
        expect(result.unchanged).toBe(0);
    });

    it('upserts each fresh review and reports `added` count', async () => {
        state.selectCounts = [0, 2]; // before, after
        state.upsertResult = {
            data: [{ id: 'r1' }, { id: 'r2' }],
            error: null,
        };
        const reviews = [
            makeReview({ review_url: 'https://r/1' }),
            makeReview({ review_url: 'https://r/2', reviewer_name: 'Sam Pillay' }),
        ];
        const { ingestDataForSEOReviews } = await import('../review-ingestion');
        const result = await ingestDataForSEOReviews(PROVIDER_ID, PLACE_ID, reviews);
        expect(result).toEqual({
            added: 2,
            unchanged: 0,
            reviewCountBefore: 0,
            reviewCountAfter: 2,
        });
        expect(state.upsertedRows).toHaveLength(2);
        expect(state.upsertedRows?.[0]).toMatchObject({
            provider_id: PROVIDER_ID,
            source: 'dataforseo',
            source_ref: 'https://r/1',
            status: 'approved',
        });
    });

    it('dedupes by computing a content hash when review_url is missing', async () => {
        state.selectCounts = [0, 1];
        state.upsertResult = { data: [{ id: 'r1' }], error: null };
        const { ingestDataForSEOReviews } = await import('../review-ingestion');
        await ingestDataForSEOReviews(PROVIDER_ID, PLACE_ID, [
            makeReview({ review_url: null, review_text: 'Body text', reviewer_name: 'Anon' }),
        ]);
        const sourceRef = state.upsertedRows?.[0]?.source_ref as string;
        // 64-char hex SHA256 prefix.
        expect(sourceRef).toMatch(/^[a-f0-9]{64}$/);
    });

    it('reports correct unchanged count when no new rows come back', async () => {
        state.selectCounts = [5, 5];
        state.upsertResult = { data: [], error: null };
        const reviews = [makeReview({ review_url: 'https://r/dup' })];
        const { ingestDataForSEOReviews } = await import('../review-ingestion');
        const result = await ingestDataForSEOReviews(PROVIDER_ID, PLACE_ID, reviews);
        expect(result.added).toBe(0);
        expect(result.unchanged).toBe(1);
        expect(result.reviewCountBefore).toBe(5);
        expect(result.reviewCountAfter).toBe(5);
    });

    it('marks cache as needing enrichment when added >= NEEDS_ENRICHMENT_THRESHOLD', async () => {
        state.selectCounts = [0, 3];
        state.upsertResult = {
            data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
            error: null,
        };
        const reviews = [
            makeReview({ review_url: 'https://r/a' }),
            makeReview({ review_url: 'https://r/b' }),
            makeReview({ review_url: 'https://r/c' }),
        ];
        const { ingestDataForSEOReviews } = await import('../review-ingestion');
        await ingestDataForSEOReviews(PROVIDER_ID, PLACE_ID, reviews);
        expect(state.cacheUpdatePayload).toMatchObject({
            last_review_count: 3,
            needs_enrichment: true,
        });
    });

    it('does NOT set needs_enrichment when added is below threshold', async () => {
        state.selectCounts = [0, 1];
        state.upsertResult = { data: [{ id: 'a' }], error: null };
        const { ingestDataForSEOReviews } = await import('../review-ingestion');
        await ingestDataForSEOReviews(PROVIDER_ID, PLACE_ID, [
            makeReview({ review_url: 'https://r/single' }),
        ]);
        expect(state.cacheUpdatePayload?.needs_enrichment).toBeUndefined();
        expect(state.cacheUpdatePayload?.last_review_count).toBe(1);
    });

    it('returns unchanged=rows.length when upsert errors out', async () => {
        state.selectCounts = [4]; // only before; early-return path skips after-query
        state.upsertResult = { data: null, error: { message: 'boom' } };
        const reviews = [
            makeReview({ review_url: 'https://r/x' }),
            makeReview({ review_url: 'https://r/y' }),
        ];
        const { ingestDataForSEOReviews } = await import('../review-ingestion');
        const result = await ingestDataForSEOReviews(PROVIDER_ID, PLACE_ID, reviews);
        expect(result.added).toBe(0);
        expect(result.unchanged).toBe(2);
        expect(result.reviewCountBefore).toBe(4);
        expect(result.reviewCountAfter).toBe(4);
    });

    it('truncates oversized body / reviewer_name fields', async () => {
        state.selectCounts = [0, 1];
        state.upsertResult = { data: [{ id: 'r1' }], error: null };
        const longBody = 'x'.repeat(6000);
        const longName = 'A'.repeat(300);
        const { ingestDataForSEOReviews } = await import('../review-ingestion');
        await ingestDataForSEOReviews(PROVIDER_ID, PLACE_ID, [
            makeReview({
                review_url: 'https://r/long',
                review_text: longBody,
                reviewer_name: longName,
            }),
        ]);
        const row = state.upsertedRows?.[0];
        expect((row?.body as string).length).toBe(5000);
        expect((row?.reviewer_name as string).length).toBe(255);
    });

    it('truncates oversized source_ref (URL) to 512 chars', async () => {
        state.selectCounts = [0, 1];
        state.upsertResult = { data: [{ id: 'r1' }], error: null };
        const longUrl = 'https://example.com/' + 'a'.repeat(600);
        const { ingestDataForSEOReviews } = await import('../review-ingestion');
        await ingestDataForSEOReviews(PROVIDER_ID, PLACE_ID, [
            makeReview({ review_url: longUrl }),
        ]);
        expect((state.upsertedRows?.[0]?.source_ref as string).length).toBe(512);
    });

    it('handles null review_text by storing empty body', async () => {
        state.selectCounts = [0, 1];
        state.upsertResult = { data: [{ id: 'r1' }], error: null };
        const { ingestDataForSEOReviews } = await import('../review-ingestion');
        await ingestDataForSEOReviews(PROVIDER_ID, PLACE_ID, [
            makeReview({ review_url: 'https://r/empty', review_text: null }),
        ]);
        expect(state.upsertedRows?.[0]?.body).toBe('');
    });
});
