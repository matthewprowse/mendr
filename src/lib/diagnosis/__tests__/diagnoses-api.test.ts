/**
 * Tests for diagnoses-api.ts
 *
 * The module uses `fetch` directly so we stub it via vi.spyOn.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    fetchConversationDiagnosis,
    patchConversation,
    invalidateConversationDiagnosisCache,
    peekCachedConversationDiagnosis,
} from '../diagnoses-api';

// ── Fetch stubbing ────────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown): void {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
        text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    } as Response);
}

function mockFetchReject(msg: string): void {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error(msg));
}

// ── Reset caches between tests ───────────────────────────────────────────────

beforeEach(() => {
    invalidateConversationDiagnosisCache('test-id');
    invalidateConversationDiagnosisCache('conv-123');
    invalidateConversationDiagnosisCache('bad-id');
    vi.clearAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ── fetchConversationDiagnosis ────────────────────────────────────────────────

describe('fetchConversationDiagnosis', () => {
    it('returns ok:true with data on a 200 response', async () => {
        const row = { id: 'conv-123', image_url: null, diagnosis: null, initial_image_description: null };
        mockFetch(200, { data: row });
        const result = await fetchConversationDiagnosis('conv-123');
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data?.id).toBe('conv-123');
        }
    });

    it('returns ok:false on a 404 response', async () => {
        mockFetch(404, { error: 'not found' });
        const result = await fetchConversationDiagnosis('bad-id');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(404);
        }
    });

    it('returns ok:false on a 500 response', async () => {
        mockFetch(500, { error: 'Internal Server Error' });
        const result = await fetchConversationDiagnosis('bad-id');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(500);
        }
    });

    it('returns ok:false on network error', async () => {
        mockFetchReject('Network error');
        const result = await fetchConversationDiagnosis('bad-id');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(0);
            expect(result.error).toContain('Network error');
        }
    });

    it('caches a successful response (no second fetch)', async () => {
        const row = { id: 'conv-123', image_url: null, diagnosis: null, initial_image_description: null };
        // Set up a persistent spy so we can count ALL calls from the start
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ data: row }),
        } as Response);

        await fetchConversationDiagnosis('conv-123');
        const callsAfterFirst = fetchSpy.mock.calls.length;

        // Second call should hit cache — no additional fetch
        await fetchConversationDiagnosis('conv-123');
        const callsAfterSecond = fetchSpy.mock.calls.length;

        expect(callsAfterFirst).toBe(1);
        expect(callsAfterSecond).toBe(1); // no additional call
    });

    it('deduplicates in-flight requests (single-flight)', async () => {
        const row = { id: 'conv-123', image_url: null, diagnosis: null, initial_image_description: null };
        vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ data: row }),
        } as Response);

        const [r1, r2] = await Promise.all([
            fetchConversationDiagnosis('conv-123'),
            fetchConversationDiagnosis('conv-123'),
        ]);
        expect(r1.ok).toBe(true);
        expect(r2.ok).toBe(true);
        // fetch should only be called once despite two concurrent requests
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    });

    it('handles invalid JSON in response body', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Error',
            text: async () => 'not json at all',
        } as Response);
        const result = await fetchConversationDiagnosis('bad-id');
        expect(result.ok).toBe(false);
    });
});

// ── invalidateConversationDiagnosisCache ──────────────────────────────────────

describe('invalidateConversationDiagnosisCache', () => {
    it('causes next fetch to hit the network again', async () => {
        const row = { id: 'conv-123', image_url: null, diagnosis: null, initial_image_description: null };
        vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ data: row }),
        } as Response);

        await fetchConversationDiagnosis('conv-123');
        invalidateConversationDiagnosisCache('conv-123');
        await fetchConversationDiagnosis('conv-123');

        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    });
});

// ── peekCachedConversationDiagnosis ───────────────────────────────────────────

describe('peekCachedConversationDiagnosis', () => {
    it('returns undefined when no cache entry exists', () => {
        invalidateConversationDiagnosisCache('never-fetched');
        const result = peekCachedConversationDiagnosis('never-fetched');
        expect(result).toBeUndefined();
    });

    it('returns the cached row after a successful fetch', async () => {
        const row = { id: 'conv-123', image_url: null, diagnosis: null, initial_image_description: null };
        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ data: row }),
        } as Response);

        await fetchConversationDiagnosis('conv-123');
        const peeked = peekCachedConversationDiagnosis('conv-123');
        expect(peeked?.id).toBe('conv-123');
    });
});

// ── patchConversation ─────────────────────────────────────────────────────────

describe('patchConversation', () => {
    it('returns ok:true on a successful PATCH', async () => {
        mockFetch(200, {});
        const result = await patchConversation('conv-123', { title: 'New title' });
        expect(result.ok).toBe(true);
    });

    it('returns ok:false on a 400 response', async () => {
        mockFetch(400, { error: 'Bad request' });
        const result = await patchConversation('conv-123', { title: 'x' });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(400);
        }
    });

    it('returns ok:false on network failure', async () => {
        mockFetchReject('Connection refused');
        const result = await patchConversation('conv-123', {});
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(0);
        }
    });

    it('invalidates the GET cache after a successful patch', async () => {
        // Prime the cache
        const row = { id: 'conv-123', image_url: null, diagnosis: null, initial_image_description: null };
        vi.spyOn(global, 'fetch')
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ data: row }),
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () => JSON.stringify({}),
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ data: row }),
            } as Response);

        await fetchConversationDiagnosis('conv-123');
        await patchConversation('conv-123', { title: 'Updated' });
        // Cache should have been invalidated — peek should return undefined
        const peeked = peekCachedConversationDiagnosis('conv-123');
        expect(peeked).toBeUndefined();
    });
});
