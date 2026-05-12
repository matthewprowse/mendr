import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (must precede vi.mock calls) ────────────────────────────────
// vi.mock factories are hoisted to the top of the file by vitest, so any
// variables they reference must also be hoisted via vi.hoisted().

const {
    mockSupabaseMaybeSingle,
    mockSupabaseUpsert,
    mockFrom,
    mockSearchPartPrice,
    mockExtractPartPrice,
} = vi.hoisted(() => {
    const mockSupabaseMaybeSingle = vi.fn();
    const mockSupabaseUpsert = vi.fn().mockResolvedValue({ error: null });
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockSupabaseMaybeSingle });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = vi.fn().mockReturnValue({
        select: mockSelect,
        upsert: mockSupabaseUpsert,
    });
    const mockSearchPartPrice = vi.fn().mockResolvedValue({
        sources: [],
        searchConfigured: false,
    });
    const mockExtractPartPrice = vi.fn().mockResolvedValue({
        price_min: null,
        price_max: null,
        price_display: null,
    });
    return {
        mockSupabaseMaybeSingle,
        mockSupabaseUpsert,
        mockFrom,
        mockSearchPartPrice,
        mockExtractPartPrice,
    };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn().mockResolvedValue({ from: mockFrom }),
}));

vi.mock('../search', () => ({
    searchPartPrice: (...args: unknown[]) => mockSearchPartPrice(...args),
}));

vi.mock('../extract-price', () => ({
    extractPartPrice: (...args: unknown[]) => mockExtractPartPrice(...args),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { lookupPartPrices } from '../lookup';

// ── Helpers ───────────────────────────────────────────────────────────────────

function simulateCacheMiss() {
    mockSupabaseMaybeSingle.mockResolvedValue({ data: null, error: null });
}

function simulateCacheHit(overrides: {
    price_min?: number | null;
    price_max?: number | null;
    price_display?: string | null;
    expires_at?: string;
} = {}) {
    mockSupabaseMaybeSingle.mockResolvedValue({
        data: {
            price_min: overrides.price_min ?? 150,
            price_max: overrides.price_max ?? 350,
            price_display: overrides.price_display ?? 'R150–R350',
            expires_at: overrides.expires_at ?? new Date(Date.now() + 86_400_000).toISOString(),
        },
        error: null,
    });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('lookupPartPrices', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Re-apply defaults cleared by clearAllMocks
        mockSupabaseUpsert.mockResolvedValue({ error: null });
        mockSearchPartPrice.mockResolvedValue({ sources: [], searchConfigured: false });
        mockExtractPartPrice.mockResolvedValue({
            price_min: null,
            price_max: null,
            price_display: null,
        });
    });

    // ── Edge cases ────────────────────────────────────────────────────────────

    it('returns an empty array when parts list is empty', async () => {
        const result = await lookupPartPrices([], 'Plumbing', '', 'cape_town');
        expect(result).toEqual([]);
        expect(mockFrom).not.toHaveBeenCalled();
    });

    // ── Deduplication ─────────────────────────────────────────────────────────

    it('deduplicates parts with the same normalised name', async () => {
        simulateCacheMiss();

        const result = await lookupPartPrices(
            ['Tap Washer', 'tap_washer', 'TAP WASHER'],
            'Plumbing',
            '',
            'cape_town',
        );

        // All three normalise to the same key → only 1 entry returned
        expect(result).toHaveLength(1);
        expect(result[0].part_name).toBe('Tap Washer');
    });

    // ── Cache hit ─────────────────────────────────────────────────────────────

    it('returns from_cache: true and price data when cache is fresh', async () => {
        simulateCacheHit({ price_min: 200, price_max: 600, price_display: 'R200–R600' });

        const result = await lookupPartPrices(['Tap washer'], 'Plumbing', '', 'cape_town');

        expect(result).toHaveLength(1);
        expect(result[0].from_cache).toBe(true);
        expect(result[0].price_min).toBe(200);
        expect(result[0].price_display).toBe('R200–R600');
        expect(mockSearchPartPrice).not.toHaveBeenCalled();
    });

    it('does not call extractPartPrice when cache is fresh', async () => {
        simulateCacheHit();
        await lookupPartPrices(['Tap washer'], 'Plumbing', '', 'cape_town');
        expect(mockExtractPartPrice).not.toHaveBeenCalled();
    });

    // ── Cache miss ────────────────────────────────────────────────────────────

    it('returns from_cache: false on a cache miss', async () => {
        simulateCacheMiss();
        const result = await lookupPartPrices(['Tap washer'], 'Plumbing', '', 'cape_town');
        expect(result).toHaveLength(1);
        expect(result[0].from_cache).toBe(false);
    });

    it('writes to cache after a live lookup', async () => {
        simulateCacheMiss();
        await lookupPartPrices(['Tap washer'], 'Plumbing', '', 'cape_town');
        expect(mockSupabaseUpsert).toHaveBeenCalled();
    });

    // ── Fallback prices ───────────────────────────────────────────────────────

    it('applies call-out fee fallback when search returns no price', async () => {
        simulateCacheMiss();
        // searchConfigured: false → extractPartPrice not called → null extracted → fallback applied

        const result = await lookupPartPrices(
            ['Call-out fee'],
            'Plumbing',
            '',
            'cape_town',
        );

        expect(result[0].price_min).not.toBeNull();
        expect(result[0].price_display).toMatch(/^R\d/);
    });

    it('applies labour fallback for labour line items', async () => {
        simulateCacheMiss();

        const result = await lookupPartPrices(
            ['Labour'],
            'Electrical',
            '',
            'cape_town',
        );

        expect(result[0].price_min).not.toBeNull();
        expect(result[0].price_display).toMatch(/hour/);
    });

    // ── Partial failure ───────────────────────────────────────────────────────

    it('returns empty price for a failed part without throwing', async () => {
        mockSupabaseMaybeSingle
            .mockResolvedValueOnce({ data: null, error: null })   // part 1: cache miss
            .mockRejectedValueOnce(new Error('DB connection lost')); // part 2: throws

        const result = await lookupPartPrices(
            ['Heating element', 'Thermostat'],
            'Appliance Repair',
            '',
            'cape_town',
        );

        expect(result).toHaveLength(2);
        expect(result[0].part_name).toBe('Heating element');
        // Failed part gets empty prices, not an exception
        expect(result[1].part_name).toBe('Thermostat');
        expect(result[1].price_min).toBeNull();
        expect(result[1].price_max).toBeNull();
        expect(result[1].price_display).toBeNull();
        expect(result[1].from_cache).toBe(false);
    });

    // ── Concurrency cap ───────────────────────────────────────────────────────

    it('never runs more than 3 parts concurrently', async () => {
        let inFlight = 0;
        let maxInFlight = 0;

        mockSupabaseMaybeSingle.mockImplementation(async () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise<void>((r) => setTimeout(r, 10));
            inFlight--;
            return { data: null, error: null };
        });

        const parts = Array.from({ length: 9 }, (_, i) => `Part ${i + 1}`);
        await lookupPartPrices(parts, 'Plumbing', '', 'cape_town');

        expect(maxInFlight).toBeLessThanOrEqual(3);
    });

    // ── Result ordering ───────────────────────────────────────────────────────

    it('preserves result order matching input order', async () => {
        simulateCacheMiss();

        const parts = ['Alpha', 'Beta', 'Gamma'];
        const result = await lookupPartPrices(parts, 'Electrical', '', 'cape_town');

        expect(result.map((r) => r.part_name)).toEqual(parts);
    });
});
