/**
 * Phase 5 — useMatchConversationContext.
 *
 * This hook resolves the diagnosis trade + location for the match page from a
 * layered set of sources (session peek → API → direct Supabase → storage
 * fallback). We mock every data dependency so the resolution precedence is
 * pinned without real network or Supabase.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const peekCachedConversationDiagnosis = vi.fn();
const fetchConversationDiagnosis = vi.fn();
vi.mock('@/lib/diagnosis/diagnoses-api', () => ({
    peekCachedConversationDiagnosis: (...a: unknown[]) => peekCachedConversationDiagnosis(...a),
    fetchConversationDiagnosis: (...a: unknown[]) => fetchConversationDiagnosis(...a),
}));

const readMatchTradeContextStorage = vi.fn();
vi.mock('@/lib/diagnosis/match-trade-context', () => ({
    readMatchTradeContextStorage: (...a: unknown[]) => readMatchTradeContextStorage(...a),
}));

const maybeSingle = vi.fn();
const supabaseFrom = vi.fn((..._a: unknown[]) => ({
    select: () => ({ eq: () => ({ maybeSingle }) }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock('@/lib/auth/supabase', () => ({
    supabase: { from: (...a: unknown[]) => supabaseFrom(...a) },
}));

const geocodeApi = vi.fn();
vi.mock('@/features/match/api/client', () => ({ geocodeApi: (...a: unknown[]) => geocodeApi(...a) }));

vi.mock('@/context/auth-context', () => ({
    useAuth: () => ({ user: { id: 'user-1' } }),
}));

import { useMatchConversationContext } from '@/features/match/hooks/use-match-conversation-context';

beforeEach(() => {
    peekCachedConversationDiagnosis.mockReset().mockReturnValue(undefined);
    fetchConversationDiagnosis.mockReset();
    readMatchTradeContextStorage.mockReset().mockReturnValue(null);
    maybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
    geocodeApi.mockReset();
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe('useMatchConversationContext — initial state', () => {
    it('starts with no location and empty address input', () => {
        const { result } = renderHook(() => useMatchConversationContext('conv-1'));
        expect(result.current.userLocation).toBeNull();
        expect(result.current.addressInput).toBe('');
    });
});

describe('resolveTradeContext', () => {
    it('returns empty for a missing conversation id', async () => {
        const { result } = renderHook(() => useMatchConversationContext(''));
        const out = await result.current.resolveTradeContext();
        expect(out).toEqual({ trade: '', trade_detail: '' });
    });

    it('resolves trade from the synchronous session peek', async () => {
        peekCachedConversationDiagnosis.mockReturnValue({
            diagnosis: { trade: 'Plumbing', trade_detail: 'Geyser Repair' },
        });
        const { result } = renderHook(() => useMatchConversationContext('conv-2'));
        const out = await result.current.resolveTradeContext();
        expect(out).toEqual({ trade: 'Plumbing', trade_detail: 'Geyser Repair' });
        expect(fetchConversationDiagnosis).not.toHaveBeenCalled();
    });

    it('falls through to the API when the peek has no usable trade', async () => {
        peekCachedConversationDiagnosis.mockReturnValue(undefined);
        fetchConversationDiagnosis.mockResolvedValue({
            ok: true,
            status: 200,
            data: { diagnosis: { trade: 'Electrical', trade_detail: '' } },
        });
        const { result } = renderHook(() => useMatchConversationContext('conv-3'));
        const out = await result.current.resolveTradeContext();
        // trade_detail falls back to trade when empty.
        expect(out).toEqual({ trade: 'Electrical', trade_detail: 'Electrical' });
    });

    it('falls back to direct Supabase when the API has no trade', async () => {
        fetchConversationDiagnosis.mockResolvedValue({ ok: true, status: 200, data: { diagnosis: null } });
        maybeSingle.mockResolvedValue({
            data: { diagnosis: { trade: 'Roofing', trade_detail: 'Leak' } },
            error: null,
        });
        const { result } = renderHook(() => useMatchConversationContext('conv-4'));
        const out = await result.current.resolveTradeContext();
        expect(out).toEqual({ trade: 'Roofing', trade_detail: 'Leak' });
    });

    it('falls back to storage when every remote source is empty', async () => {
        fetchConversationDiagnosis.mockResolvedValue({ ok: false, status: 0, error: 'x' });
        maybeSingle.mockResolvedValue({ data: null, error: null });
        readMatchTradeContextStorage.mockReturnValue({ trade: 'Painting', trade_detail: 'Interior' });
        const { result } = renderHook(() => useMatchConversationContext('conv-5'));
        const out = await result.current.resolveTradeContext();
        expect(out).toEqual({ trade: 'Painting', trade_detail: 'Interior' });
    });

    it('ignores an "n/a" trade value', async () => {
        peekCachedConversationDiagnosis.mockReturnValue({ diagnosis: { trade: 'n/a' } });
        fetchConversationDiagnosis.mockResolvedValue({ ok: true, status: 200, data: { diagnosis: null } });
        maybeSingle.mockResolvedValue({ data: null, error: null });
        readMatchTradeContextStorage.mockReturnValue(null);
        const { result } = renderHook(() => useMatchConversationContext('conv-6'));
        const out = await result.current.resolveTradeContext();
        expect(out).toEqual({ trade: '', trade_detail: '' });
    });
});

describe('reverseGeocodeLatLng', () => {
    it('returns the resolved address string', async () => {
        geocodeApi.mockResolvedValue({ address: 'Sea Point, Cape Town' });
        const { result } = renderHook(() => useMatchConversationContext('conv-7'));
        const addr = await result.current.reverseGeocodeLatLng(-33.9, 18.4);
        expect(addr).toBe('Sea Point, Cape Town');
    });

    it('returns empty string when geocode yields no address', async () => {
        geocodeApi.mockResolvedValue(null);
        const { result } = renderHook(() => useMatchConversationContext('conv-8'));
        const addr = await result.current.reverseGeocodeLatLng(-33.9, 18.4);
        expect(addr).toBe('');
    });
});

describe('setUserLocation / setAddressInput', () => {
    it('exposes setters that update the returned state', () => {
        const { result } = renderHook(() => useMatchConversationContext('conv-9'));
        act(() => {
            result.current.setAddressInput('Newlands');
            result.current.setUserLocation({ lat: -33.97, lng: 18.45, address: 'Newlands' });
        });
        expect(result.current.addressInput).toBe('Newlands');
        expect(result.current.userLocation?.address).toBe('Newlands');
    });
});
