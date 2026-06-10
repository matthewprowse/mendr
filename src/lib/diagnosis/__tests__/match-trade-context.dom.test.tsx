/**
 * Tests for match-trade-context.ts
 *
 * Uses jsdom via .dom.test.tsx suffix so sessionStorage is available.
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import {
    matchTradeContextStorageKey,
    writeMatchTradeContextStorage,
    readMatchTradeContextStorage,
} from '../match-trade-context';

beforeEach(() => {
    sessionStorage.clear();
});

describe('matchTradeContextStorageKey', () => {
    it('includes the conversationId in the key', () => {
        const key = matchTradeContextStorageKey('conv-123');
        expect(key).toContain('conv-123');
    });

    it('returns different keys for different conversationIds', () => {
        expect(matchTradeContextStorageKey('a')).not.toBe(matchTradeContextStorageKey('b'));
    });
});

describe('writeMatchTradeContextStorage', () => {
    it('stores trade and trade_detail', () => {
        writeMatchTradeContextStorage('conv-1', 'Electrical', 'DB Board Tripping');
        const key = matchTradeContextStorageKey('conv-1');
        const raw = sessionStorage.getItem(key);
        expect(raw).not.toBeNull();
        const parsed = JSON.parse(raw!);
        expect(parsed.trade).toBe('Electrical');
        expect(parsed.trade_detail).toBe('DB Board Tripping');
    });

    it('uses trade as trade_detail when tradeDetail is omitted', () => {
        writeMatchTradeContextStorage('conv-2', 'Plumbing');
        const raw = sessionStorage.getItem(matchTradeContextStorageKey('conv-2'));
        const parsed = JSON.parse(raw!);
        expect(parsed.trade_detail).toBe('Plumbing');
    });

    it('does NOT write when trade is empty', () => {
        writeMatchTradeContextStorage('conv-3', '');
        const raw = sessionStorage.getItem(matchTradeContextStorageKey('conv-3'));
        expect(raw).toBeNull();
    });

    it('does NOT write when trade is N/A', () => {
        writeMatchTradeContextStorage('conv-4', 'N/A');
        const raw = sessionStorage.getItem(matchTradeContextStorageKey('conv-4'));
        expect(raw).toBeNull();
    });

    it('does NOT write when trade is n/a (lowercase)', () => {
        writeMatchTradeContextStorage('conv-5', 'n/a');
        expect(sessionStorage.getItem(matchTradeContextStorageKey('conv-5'))).toBeNull();
    });
});

describe('readMatchTradeContextStorage', () => {
    it('returns null for a conversationId with no stored context', () => {
        expect(readMatchTradeContextStorage('no-such-id')).toBeNull();
    });

    it('returns null for empty conversationId', () => {
        expect(readMatchTradeContextStorage('')).toBeNull();
    });

    it('returns the stored trade and trade_detail after a write', () => {
        writeMatchTradeContextStorage('conv-6', 'Security', 'Gate Motor Fault');
        const result = readMatchTradeContextStorage('conv-6');
        expect(result).not.toBeNull();
        expect(result?.trade).toBe('Security');
        expect(result?.trade_detail).toBe('Gate Motor Fault');
    });

    it('returns null if the stored trade is N/A', () => {
        const key = matchTradeContextStorageKey('conv-7');
        sessionStorage.setItem(key, JSON.stringify({ trade: 'N/A', trade_detail: 'whatever' }));
        expect(readMatchTradeContextStorage('conv-7')).toBeNull();
    });

    it('returns null if sessionStorage contains invalid JSON', () => {
        const key = matchTradeContextStorageKey('conv-8');
        sessionStorage.setItem(key, 'not-json');
        expect(readMatchTradeContextStorage('conv-8')).toBeNull();
    });

    it('uses trade as trade_detail when trade_detail is missing from stored object', () => {
        const key = matchTradeContextStorageKey('conv-9');
        sessionStorage.setItem(key, JSON.stringify({ trade: 'Electrical' }));
        const result = readMatchTradeContextStorage('conv-9');
        expect(result?.trade_detail).toBe('Electrical');
    });
});
