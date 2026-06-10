/**
 * Phase 5 — match-page-cache tests.
 *
 * The cache layers an in-memory Map over sessionStorage with a 30-minute TTL.
 * Run in jsdom so the sessionStorage branch is exercised. Each test uses a
 * unique conversationId to avoid the process-wide in-memory Map leaking state.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    loadMatchPageCache,
    saveMatchPageCache,
    type MatchPageCacheEntry,
} from '@/features/match/cache/match-page-cache';

function entry(overrides?: Partial<MatchPageCacheEntry>): MatchPageCacheEntry {
    return {
        providers: [],
        companyIndex: 1,
        userLocation: null,
        addressInput: '',
        enrichmentCache: {},
        mendrReviewCountByProviderId: {},
        savedAt: Date.now(),
        ...overrides,
    };
}

let convCounter = 0;
function uniqueConv(): string {
    convCounter += 1;
    return `conv-${convCounter}-${Math.random().toString(36).slice(2)}`;
}

beforeEach(() => {
    window.sessionStorage.clear();
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe('saveMatchPageCache / loadMatchPageCache', () => {
    it('returns null for an empty conversation id', () => {
        expect(loadMatchPageCache('')).toBeNull();
    });

    it('returns null when nothing has been stored', () => {
        expect(loadMatchPageCache(uniqueConv())).toBeNull();
    });

    it('round-trips an entry through the in-memory cache', () => {
        const conv = uniqueConv();
        const e = entry({ addressInput: 'Sea Point' });
        saveMatchPageCache(conv, e);
        const loaded = loadMatchPageCache(conv);
        expect(loaded?.addressInput).toBe('Sea Point');
    });

    it('persists to sessionStorage so it survives a memory miss', () => {
        const conv = uniqueConv();
        const e = entry({ addressInput: 'Claremont' });
        saveMatchPageCache(conv, e);
        // Simulate a fresh load that misses memory but reads storage by writing
        // a stale-by-zero savedAt directly is not needed; instead verify the
        // raw key exists and load returns it.
        const raw = window.sessionStorage.getItem(`match-page-cache:${conv}`);
        expect(raw).toContain('Claremont');
        expect(loadMatchPageCache(conv)?.addressInput).toBe('Claremont');
    });

    it('evicts and returns null for an entry older than the TTL', () => {
        const conv = uniqueConv();
        // 31 minutes ago — beyond the 30-minute TTL.
        const stale = entry({ savedAt: Date.now() - 31 * 60 * 1000, addressInput: 'Old' });
        // Write directly to sessionStorage so it bypasses the fresh memory write.
        window.sessionStorage.setItem(`match-page-cache:${conv}`, JSON.stringify(stale));
        const loaded = loadMatchPageCache(conv);
        expect(loaded).toBeNull();
        expect(window.sessionStorage.getItem(`match-page-cache:${conv}`)).toBeNull();
    });

    it('does not throw when sessionStorage contains corrupt JSON', () => {
        const conv = uniqueConv();
        window.sessionStorage.setItem(`match-page-cache:${conv}`, '{not valid json');
        expect(loadMatchPageCache(conv)).toBeNull();
    });

    it('does nothing on save when the conversation id is empty', () => {
        saveMatchPageCache('', entry());
        // No key should be written for the empty id.
        expect(window.sessionStorage.getItem('match-page-cache:')).toBeNull();
    });
});
