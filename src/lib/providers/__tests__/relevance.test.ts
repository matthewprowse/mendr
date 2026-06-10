import { describe, it, expect } from 'vitest';
import { isProviderRelevantForTrade } from '../relevance';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

type Mode = 'strict' | 'relaxed';

interface RelevanceInput {
    place?: Record<string, unknown>;
    aiData?: Record<string, unknown> | null;
    cached?: Record<string, unknown> | null;
    tradeNorm?: string;
    isBoreholeLikeDetail?: boolean;
    mode?: Mode;
}

function call(input: RelevanceInput = {}): boolean {
    return isProviderRelevantForTrade({
        place: input.place ?? {},
        aiData: input.aiData ?? {},
        cached: input.cached ?? {},
        tradeNorm: input.tradeNorm ?? '',
        isBoreholeLikeDetail: input.isBoreholeLikeDetail ?? false,
        mode: input.mode ?? 'strict',
    });
}

// ---------------------------------------------------------------------------
// Banned types — Google `types[]` field
// ---------------------------------------------------------------------------

describe('isProviderRelevantForTrade — banned types', () => {
    it('rejects a restaurant regardless of name', () => {
        const result = call({
            place: { types: ['restaurant'], displayName: { text: 'Best Plumbing Cafe' } },
        });
        expect(result).toBe(false);
    });

    it('rejects a hospital', () => {
        const result = call({
            place: { types: ['hospital'] },
            aiData: { name: 'Electrical Hospital' },
        });
        expect(result).toBe(false);
    });

    it('rejects a cannabis dispensary', () => {
        expect(call({ place: { types: ['cannabis_store'] } })).toBe(false);
        expect(call({ place: { types: ['marijuana_dispensary'] } })).toBe(false);
    });

    it('rejects a beauty salon', () => {
        expect(call({ place: { types: ['beauty_salon'] } })).toBe(false);
    });

    it('rejects when ANY of multiple types is banned', () => {
        const result = call({
            place: {
                types: ['general_contractor', 'restaurant'],
                displayName: { text: 'Cape Plumbing' },
            },
        });
        expect(result).toBe(false);
    });

    it('handles missing types array gracefully', () => {
        const result = call({
            place: { displayName: { text: 'Cape Plumbing & Electrical' } },
        });
        expect(result).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Banned keywords — name / specialisations / address haystack
// ---------------------------------------------------------------------------

describe('isProviderRelevantForTrade — banned keywords', () => {
    it('rejects a name containing "coffee"', () => {
        const result = call({
            place: { displayName: { text: 'Coffee & Cabling' } },
        });
        expect(result).toBe(false);
    });

    it('rejects a name containing "guest house"', () => {
        const result = call({
            place: { displayName: { text: 'The Plumber Guest House' } },
        });
        expect(result).toBe(false);
    });

    it('rejects a name containing "casino"', () => {
        const result = call({
            place: { displayName: { text: 'Casino Royale Electrical' } },
        });
        expect(result).toBe(false);
    });

    it('rejects a profanity-laden name', () => {
        const result = call({
            place: { displayName: { text: 'Fuck It Plumbing Services' } },
        });
        expect(result).toBe(false);
    });

    it('rejects a standalone "bar" (drinking establishment)', () => {
        expect(call({ place: { displayName: { text: 'The Wine Bar' } } })).toBe(false);
    });

    it('does NOT reject "rebar" via the bar word-boundary check', () => {
        // Previously the substring "bar " falsely rejected "Rebar Construction".
        const result = call({
            place: { displayName: { text: 'Rebar Construction' } },
            mode: 'strict',
        });
        expect(result).toBe(true);
    });

    it('rejects a beauty salon by keyword even with a service keyword present', () => {
        const result = call({
            place: { displayName: { text: 'Beauty Salon Builders' } },
            mode: 'strict',
        });
        expect(result).toBe(false);
    });

    it('does NOT reject a trade whose name merely contains "beauty"', () => {
        // Narrowed keyword 'beauty salon' should no longer catch this.
        const result = call({
            place: { displayName: { text: 'Beauty Touch Painting' } },
            mode: 'strict',
        });
        expect(result).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Strict mode — service keyword gate
// ---------------------------------------------------------------------------

describe('isProviderRelevantForTrade — strict mode service gate', () => {
    it('rejects providers with no service keyword (strict)', () => {
        const result = call({
            place: { displayName: { text: 'Acme Logistics Co' } },
            mode: 'strict',
        });
        expect(result).toBe(false);
    });

    it('accepts a plumber via SERVICE_KEYWORDS', () => {
        const result = call({
            place: { displayName: { text: 'Cape Plumbing Services' } },
            mode: 'strict',
        });
        expect(result).toBe(true);
    });

    it('accepts a contractor via SERVICE_KEYWORDS', () => {
        const result = call({
            place: { displayName: { text: 'Premier Building Contractor' } },
            mode: 'strict',
        });
        expect(result).toBe(true);
    });

    it('finds keyword in specialisations from aiData', () => {
        const result = call({
            place: { displayName: { text: 'Acme Co' } },
            aiData: { specialisations: ['electrical wiring'] },
            mode: 'strict',
        });
        expect(result).toBe(true);
    });

    it('finds keyword in specialisations from cached', () => {
        const result = call({
            place: { displayName: { text: 'Acme Co' } },
            cached: { specialisations: ['waterproofing'] },
            mode: 'strict',
        });
        expect(result).toBe(true);
    });

    it('falls back to place displayName when aiData.name is empty', () => {
        const result = call({
            place: { displayName: { text: 'Cape Plumbing' } },
            aiData: {},
            mode: 'strict',
        });
        expect(result).toBe(true);
    });

    it('falls back to cached.name when both aiData and place name are empty', () => {
        const result = call({
            place: {},
            aiData: {},
            cached: { name: 'Cape Plumbing' },
            mode: 'strict',
        });
        expect(result).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Relaxed mode
// ---------------------------------------------------------------------------

describe('isProviderRelevantForTrade — relaxed mode', () => {
    it('accepts a generic "repair" provider in relaxed mode', () => {
        const result = call({
            place: { displayName: { text: 'Home Repairs Co' } },
            mode: 'relaxed',
        });
        expect(result).toBe(true);
    });

    it('accepts a generic "maintenance" provider in relaxed mode', () => {
        const result = call({
            place: { displayName: { text: 'Property Maintenance' } },
            mode: 'relaxed',
        });
        expect(result).toBe(true);
    });

    it('still rejects an unrelated provider even in relaxed mode', () => {
        const result = call({
            place: { displayName: { text: 'Bookkeeping & Tax' } },
            mode: 'relaxed',
        });
        expect(result).toBe(false);
    });

    it('strict mode rejects what relaxed mode accepts (repair-only)', () => {
        const ctx: RelevanceInput = {
            place: { displayName: { text: 'Home Repairs Co' } },
        };
        expect(call({ ...ctx, mode: 'strict' })).toBe(false);
        expect(call({ ...ctx, mode: 'relaxed' })).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Trade-specific gates
// ---------------------------------------------------------------------------

describe('isProviderRelevantForTrade — plumb trade gate', () => {
    it('rejects a non-plumbing service when tradeNorm includes "plumb" (strict)', () => {
        const result = call({
            place: { displayName: { text: 'Cape Tile Specialists' } },
            tradeNorm: 'plumbing',
            mode: 'strict',
        });
        expect(result).toBe(false);
    });

    it('accepts when haystack contains "plumb"', () => {
        const result = call({
            place: { displayName: { text: 'Cape Plumbing' } },
            tradeNorm: 'plumbing',
            mode: 'strict',
        });
        expect(result).toBe(true);
    });

    it('accepts when haystack contains "geyser"', () => {
        const result = call({
            place: { displayName: { text: 'Geyser Doctor Co' } },
            tradeNorm: 'plumbing',
            mode: 'strict',
        });
        expect(result).toBe(true);
    });

    it('accepts when haystack contains "drain"', () => {
        const result = call({
            place: { displayName: { text: 'Quick Drain Service' } },
            tradeNorm: 'plumbing',
            mode: 'strict',
        });
        expect(result).toBe(true);
    });
});

describe('isProviderRelevantForTrade — borehole-like detail', () => {
    it('accepts a borehole specialist', () => {
        const result = call({
            place: { displayName: { text: 'Western Cape Borehole' } },
            tradeNorm: 'plumbing',
            isBoreholeLikeDetail: true,
        });
        expect(result).toBe(true);
    });

    it('accepts a well-driller', () => {
        const result = call({
            place: { displayName: { text: 'Pro Well Drill' } },
            tradeNorm: 'plumbing',
            isBoreholeLikeDetail: true,
        });
        expect(result).toBe(true);
    });

    it('accepts a pump specialist', () => {
        const result = call({
            place: { displayName: { text: 'Pump Solutions' } },
            tradeNorm: 'plumbing',
            isBoreholeLikeDetail: true,
        });
        expect(result).toBe(true);
    });

    it('rejects a regular plumber when borehole-like detail is required', () => {
        const result = call({
            place: { displayName: { text: 'Cape Plumbing Services' } },
            tradeNorm: 'plumbing',
            isBoreholeLikeDetail: true,
        });
        expect(result).toBe(false);
    });
});

describe('isProviderRelevantForTrade — electric / locksmith / pool / paint gates', () => {
    it('rejects a non-electrician for electric trade (strict)', () => {
        const result = call({
            place: { displayName: { text: 'Cape Plumbing' } },
            tradeNorm: 'electrical',
            mode: 'strict',
        });
        expect(result).toBe(false);
    });

    it('accepts an electrician for electric trade', () => {
        const result = call({
            place: { displayName: { text: 'Cape Electrical' } },
            tradeNorm: 'electrical',
            mode: 'strict',
        });
        expect(result).toBe(true);
    });

    it('rejects a non-locksmith for locksmith trade (strict)', () => {
        const result = call({
            place: { displayName: { text: 'Cape Plumbing' } },
            tradeNorm: 'locksmith',
            mode: 'strict',
        });
        expect(result).toBe(false);
    });

    it('accepts a locksmith for locksmith trade', () => {
        const result = call({
            place: { displayName: { text: 'Cape Locksmith Services' } },
            tradeNorm: 'locksmith',
            mode: 'strict',
        });
        expect(result).toBe(true);
    });

    it('rejects a non-pool service for pool trade (strict)', () => {
        const result = call({
            place: { displayName: { text: 'Cape Plumbing' } },
            tradeNorm: 'swimming pool',
            mode: 'strict',
        });
        expect(result).toBe(false);
    });

    it('accepts a pool specialist for pool trade', () => {
        const result = call({
            place: { displayName: { text: 'Pool Pro Services' } },
            tradeNorm: 'swimming pool',
            mode: 'strict',
        });
        expect(result).toBe(true);
    });

    it('rejects a non-painter for paint trade (strict)', () => {
        const result = call({
            place: { displayName: { text: 'Cape Plumbing' } },
            tradeNorm: 'painting',
            mode: 'strict',
        });
        expect(result).toBe(false);
    });

    it('accepts a painter for painting trade', () => {
        const result = call({
            place: { displayName: { text: 'Cape Paint Specialists' } },
            tradeNorm: 'painting',
            mode: 'strict',
        });
        expect(result).toBe(true);
    });
});

describe('isProviderRelevantForTrade — security & access gate', () => {
    it('rejects pure security signal without gate/garage door in types (strict)', () => {
        const result = call({
            place: {
                displayName: { text: 'Acme Security' },
                types: ['security_service', 'general_contractor'],
            },
            tradeNorm: 'security & access',
            mode: 'strict',
        });
        // Has security keyword in name -> passes SERVICE_KEYWORDS? No: "security" is not in SERVICE_KEYWORDS,
        // but "alarm" is. Add an alarm signal in haystack.
        expect(result).toBe(false);
    });

    it('accepts security provider with gate/garage_door type', () => {
        const result = call({
            place: {
                displayName: { text: 'Cape Gate & Alarm' },
                types: ['gate_service'],
            },
            tradeNorm: 'security & access',
            mode: 'strict',
        });
        expect(result).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Empty-field edges
// ---------------------------------------------------------------------------

describe('isProviderRelevantForTrade — empty fields', () => {
    it('handles entirely empty inputs (no service signal -> reject in strict)', () => {
        const result = call({
            place: {},
            aiData: {},
            cached: {},
            mode: 'strict',
        });
        expect(result).toBe(false);
    });

    it('handles entirely empty inputs (no service signal -> reject in relaxed)', () => {
        const result = call({
            place: {},
            aiData: {},
            cached: {},
            mode: 'relaxed',
        });
        expect(result).toBe(false);
    });

    it('handles null aiData / cached without throwing', () => {
        expect(() =>
            call({
                place: { displayName: { text: 'Cape Plumbing' } },
                aiData: null,
                cached: null,
            }),
        ).not.toThrow();
    });

    it('accepts when only formattedAddress carries the keyword', () => {
        const result = call({
            place: {
                displayName: { text: 'Acme Co' },
                formattedAddress: '12 Plumbing Lane',
            },
            mode: 'strict',
        });
        expect(result).toBe(true);
    });
});
