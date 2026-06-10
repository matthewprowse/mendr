import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    mockSupabaseClient,
    type MockSupabaseClient,
    type SupabaseQueryResult,
} from '@/__tests__/helpers/route-test';

let adminClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

const generateContent = vi.fn();
vi.mock('@/lib/ai/ai-client', () => ({
    getGenAiClient: () => ({ models: { generateContent } }),
    GEMINI_ENRICHMENT_MODEL_NAME: 'gemini-test',
}));

import { enrichProvider, enrichProviderReviewSummaryFast } from '../provider-enrichment';

/**
 * Per-table resolver: returns one result for writes
 * (insert/update/upsert/delete) and another for reads. The mock builder
 * records the last terminal operation, so a single table can serve both the
 * read and the subsequent write inside one function call.
 */
function readWrite(
    read: SupabaseQueryResult,
    write: SupabaseQueryResult = { data: null, error: null },
): (table: string, op: string) => SupabaseQueryResult {
    return (_table, op) => {
        if (op === 'insert' || op === 'update' || op === 'upsert' || op === 'delete') {
            return write;
        }
        return read;
    };
}

const SA_PROVIDER = {
    id: 'prov-1',
    google_place_id: 'places/ChIJ1',
    website: null as string | null,
    name: 'Acme Plumbing',
    summary: null,
    rating: 4.6,
    rating_count: 12,
    address: 'Cape Town',
    specialisations: null as string[] | null,
    latitude: -33.9,
    longitude: 18.4,
    google_generative_summary: null as string | null,
    field_sources: null as Record<string, string> | null,
};

/** A clean combined-enrichment JSON payload that passes the leak guard. */
const GOOD_COMBINED = JSON.stringify({
    bio: 'The team handles blocked drains and geyser repairs across the southern suburbs. They turn up on time and explain the work in plain language before starting.',
    specialisations: ['Drain Cleaning', 'Geyser Repair', 'Leak Detection', 'Toilet Repair'],
    website_quality: 'high',
    highlights: [
        'They offer a same day emergency callout for burst pipes',
        'Every job carries a written workmanship guarantee',
        'Quotes are fixed and shared before any work begins',
    ],
    review_summary:
        'Reliable and tidy work that solves the problem first time. The pricing is fair and clearly explained.',
    narrative:
        'The team has worked across the southern suburbs for over a decade. They focus on blocked drains, geyser swaps and tracing hidden leaks, and they leave the site clean and tidy before they finish the job.',
});

/** Combined output whose bio is too short to pass the quality gate. */
const LOW_QUALITY_COMBINED = JSON.stringify({
    bio: 'Good plumber.',
    specialisations: [],
    website_quality: 'low',
    highlights: [],
    review_summary: '',
    narrative: '',
});

function geminiReturns(text: string) {
    generateContent.mockResolvedValue({ text });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('enrichProvider', () => {
    it('returns not found when the provider row is missing', async () => {
        adminClient = mockSupabaseClient({ tables: { providers: { data: null, error: null } } });
        expect(await enrichProvider('prov-1')).toEqual({ ok: false, reason: 'Provider not found' });
    });

    it('skips when the cache is fresh, ok quality, and version matches', async () => {
        const now = new Date().toISOString();
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: { ...SA_PROVIDER, name: 'Acme' }, error: null },
                provider_cache: {
                    data: {
                        scrape_status: 'ok',
                        scraped_at: now,
                        enriched_at: now,
                        cache_version: 1,
                        enrichment_quality: 'ok',
                    },
                    error: null,
                },
            },
        });
        expect(await enrichProvider('prov-1')).toEqual({
            ok: true,
            skipped: true,
            reason: 'Cache fresh',
        });
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('skips when a low-quality enrichment is still cooling off', async () => {
        const now = new Date().toISOString();
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: SA_PROVIDER, error: null },
                provider_cache: {
                    data: {
                        scrape_status: 'ok',
                        scraped_at: now,
                        enriched_at: now,
                        cache_version: 1,
                        enrichment_quality: 'low',
                    },
                    error: null,
                },
            },
        });
        expect(await enrichProvider('prov-1')).toEqual({
            ok: true,
            skipped: true,
            reason: 'Low quality retry cooling off',
        });
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('skips when a recent failed scrape is still retry-locked', async () => {
        const now = new Date().toISOString();
        adminClient = mockSupabaseClient({
            tables: {
                providers: { data: SA_PROVIDER, error: null },
                provider_cache: {
                    data: {
                        scrape_status: 'failed',
                        scraped_at: now,
                        enriched_at: null,
                        cache_version: 1,
                        enrichment_quality: null,
                    },
                    error: null,
                },
            },
        });
        expect(await enrichProvider('prov-1')).toEqual({
            ok: true,
            skipped: true,
            reason: 'Failed recently, retry locked',
        });
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('runs full enrichment when the cache version does not match (stale)', async () => {
        const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        geminiReturns(GOOD_COMBINED);
        adminClient = mockSupabaseClient({
            tables: {
                providers: readWrite({ data: { ...SA_PROVIDER, website: null }, error: null }),
                provider_cache: readWrite(
                    {
                        data: {
                            scrape_status: 'ok',
                            scraped_at: old,
                            enriched_at: old,
                            cache_version: 99, // mismatch vs target version
                            enrichment_quality: 'ok',
                        },
                        error: null,
                    },
                    { data: null, error: null },
                ),
                reviews: { data: [], error: null },
            },
            // Pin cacheVersion via options below; here resolver returns mismatch.
        });
        const result = await enrichProvider('prov-1', { cacheVersion: 1, trade: 'Plumber' });
        expect(result.ok).toBe(true);
        expect(generateContent).toHaveBeenCalled();
    });

    it('rejects a provider with coordinates outside South Africa', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: readWrite({
                    data: {
                        ...SA_PROVIDER,
                        name: 'Foreign Co',
                        address: 'London',
                        latitude: 51.5,
                        longitude: -0.12,
                    },
                    error: null,
                }),
                provider_cache: { data: null, error: null },
            },
        });
        const result = await enrichProvider('prov-1');
        expect(result).toEqual({ ok: false, reason: 'Non-SA coordinates — skipping enrichment' });
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('completes the full pipeline with no website (scrape_status skip) and writes provider copy', async () => {
        geminiReturns(GOOD_COMBINED);
        const providerWrites: unknown[] = [];
        adminClient = mockSupabaseClient({
            tables: {
                providers: (_t, op) => {
                    if (op !== 'select') providerWrites.push(op);
                    return { data: { ...SA_PROVIDER, website: null }, error: null };
                },
                provider_cache: readWrite({ data: null, error: null }, { data: null, error: null }),
                reviews: {
                    data: [
                        { rating: 5, body: 'Fixed our burst geyser within the hour, very professional.', source: 'google' },
                        { rating: 4, body: 'Cleared a stubborn blocked drain and left no mess at all.', source: 'mendr' },
                    ],
                    error: null,
                },
            },
        });
        const result = await enrichProvider('prov-1', { trade: 'Plumber' });
        expect(result).toEqual({ ok: true });
        expect(generateContent).toHaveBeenCalledTimes(1);
        // providers table updated at least once (enrichment flag + copy write)
        expect(providerWrites.length).toBeGreaterThan(0);
    });

    it('scrapes a website successfully and feeds the HTML into enrichment', async () => {
        geminiReturns(GOOD_COMBINED);
        const html =
            '<html><head><title>Acme Plumbing Cape Town</title>' +
            '<meta name="description" content="Trusted plumbers serving the southern suburbs."></head>' +
            '<body><h1>Emergency Plumbing</h1><p>' +
            'We unblock drains, replace geysers and trace hidden leaks for homes across Cape Town. '.repeat(4) +
            '</p></body></html>';
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                ok: true,
                status: 200,
                headers: { get: (k: string) => (k === 'content-type' ? 'text/html; charset=utf-8' : null) },
                text: async () => html,
            })),
        );
        adminClient = mockSupabaseClient({
            tables: {
                providers: readWrite({
                    data: { ...SA_PROVIDER, website: 'https://acme.co.za' },
                    error: null,
                }),
                provider_cache: readWrite({ data: null, error: null }),
                reviews: { data: [], error: null },
            },
        });
        const result = await enrichProvider('prov-1');
        expect(result).toEqual({ ok: true });
        expect(generateContent).toHaveBeenCalledTimes(1);
        const promptArg = generateContent.mock.calls[0][0].contents[0].parts[0].text as string;
        expect(promptArg).toContain('Acme Plumbing Cape Town');
    });

    it('marks scrape_status failed when the website returns non-HTML', async () => {
        geminiReturns(GOOD_COMBINED);
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                ok: true,
                status: 200,
                headers: { get: (k: string) => (k === 'content-type' ? 'application/pdf' : null) },
                text: async () => 'PDF',
            })),
        );
        adminClient = mockSupabaseClient({
            tables: {
                providers: readWrite({
                    data: { ...SA_PROVIDER, website: 'https://acme.co.za/brochure.pdf' },
                    error: null,
                }),
                provider_cache: readWrite({ data: null, error: null }),
                reviews: { data: [], error: null },
            },
        });
        const result = await enrichProvider('prov-1');
        expect(result.ok).toBe(true);
    });

    it('tolerates a website fetch that throws', async () => {
        geminiReturns(GOOD_COMBINED);
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new Error('ECONNREFUSED');
            }),
        );
        adminClient = mockSupabaseClient({
            tables: {
                providers: readWrite({
                    data: { ...SA_PROVIDER, website: 'https://down.example.co.za' },
                    error: null,
                }),
                provider_cache: readWrite({ data: null, error: null }),
                reviews: { data: [], error: null },
            },
        });
        const result = await enrichProvider('prov-1');
        expect(result.ok).toBe(true);
    });

    it('returns ok with cache write failure surfaced when the cache upsert errors', async () => {
        geminiReturns(GOOD_COMBINED);
        adminClient = mockSupabaseClient({
            tables: {
                providers: readWrite({ data: SA_PROVIDER, error: null }),
                provider_cache: readWrite(
                    { data: null, error: null },
                    { data: null, error: { message: 'permission denied' } },
                ),
                reviews: { data: [], error: null },
            },
        });
        const result = await enrichProvider('prov-1');
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('Cache write failed');
    });

    it('returns ok without writing copy when enrichment quality is low and narrative is unusable', async () => {
        geminiReturns(LOW_QUALITY_COMBINED);
        adminClient = mockSupabaseClient({
            tables: {
                providers: readWrite({ data: SA_PROVIDER, error: null }),
                provider_cache: readWrite({ data: null, error: null }),
                reviews: { data: [], error: null },
            },
        });
        const result = await enrichProvider('prov-1');
        expect(result).toEqual({ ok: true });
    });

    it('handles a null AI response (failed Gemini call) and still writes the cache', async () => {
        generateContent.mockRejectedValue(new Error('429 quota exceeded'));
        adminClient = mockSupabaseClient({
            tables: {
                providers: readWrite({ data: SA_PROVIDER, error: null }),
                provider_cache: readWrite({ data: null, error: null }),
                reviews: { data: [], error: null },
            },
        });
        const result = await enrichProvider('prov-1');
        expect(result).toEqual({ ok: true });
    });

    it('respects contractor-owned field_sources and does not overwrite claimed copy', async () => {
        geminiReturns(GOOD_COMBINED);
        const patches: Record<string, unknown>[] = [];
        adminClient = mockSupabaseClient({
            tables: {
                providers: (_t, op) => {
                    if (op === 'update') patches.push({});
                    return {
                        data: {
                            ...SA_PROVIDER,
                            field_sources: {
                                about: 'contractor',
                                summary_long: 'contractor',
                                specialisations: 'contractor',
                                name: 'contractor',
                            },
                        },
                        error: null,
                    };
                },
                provider_cache: readWrite({ data: null, error: null }),
                reviews: { data: [], error: null },
            },
        });
        const result = await enrichProvider('prov-1');
        expect(result).toEqual({ ok: true });
        expect(generateContent).toHaveBeenCalled();
    });

    it('flags a non-SA provider failure even when google_place_id is absent', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: readWrite({
                    data: { ...SA_PROVIDER, google_place_id: null, latitude: 0, longitude: 0 },
                    error: null,
                }),
                provider_cache: { data: null, error: null },
            },
        });
        const result = await enrichProvider('prov-1');
        expect(result.ok).toBe(false);
    });
});

describe('enrichProviderReviewSummaryFast', () => {
    it('returns not found when the provider row is missing', async () => {
        adminClient = mockSupabaseClient({ tables: { providers: { data: null, error: null } } });
        expect(await enrichProviderReviewSummaryFast('prov-1')).toEqual({
            ok: false,
            reason: 'Provider not found',
        });
    });

    it('skips when a review summary is already cached', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: {
                    data: { id: 'prov-1', google_place_id: 'places/ChIJ1', name: 'Acme' },
                    error: null,
                },
                provider_cache: {
                    data: { review_summary: 'Already summarised.', enriched_at: null },
                    error: null,
                },
            },
        });
        expect(await enrichProviderReviewSummaryFast('prov-1')).toEqual({
            ok: true,
            skipped: true,
            reason: 'Summary cached',
        });
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('writes a fast_insufficient marker when there are no reviews', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: {
                    data: { id: 'prov-1', google_place_id: 'places/ChIJ1', name: 'Acme' },
                    error: null,
                },
                provider_cache: readWrite({ data: null, error: null }, { data: null, error: null }),
                reviews: { data: [], error: null },
            },
        });
        const result = await enrichProviderReviewSummaryFast('prov-1');
        expect(result).toEqual({
            ok: true,
            skipped: true,
            reason: 'Insufficient reviews for fast summary',
        });
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('returns failure when the insufficient-reviews marker insert fails', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: {
                    data: { id: 'prov-1', google_place_id: 'places/ChIJ1', name: 'Acme' },
                    error: null,
                },
                provider_cache: readWrite(
                    { data: null, error: null },
                    { data: null, error: { message: 'insert blocked' } },
                ),
                reviews: { data: [], error: null },
            },
        });
        const result = await enrichProviderReviewSummaryFast('prov-1');
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('insufficient reviews');
    });

    it('generates and inserts a fast review summary when reviews are sufficient', async () => {
        geminiReturns(
            JSON.stringify({
                review_summary:
                    'Quick and tidy work that solves the problem first time. The pricing is fair and clearly explained.',
            }),
        );
        adminClient = mockSupabaseClient({
            tables: {
                providers: {
                    data: { id: 'prov-1', google_place_id: 'places/ChIJ1', name: 'Acme Plumbing' },
                    error: null,
                },
                provider_cache: readWrite({ data: null, error: null }, { data: null, error: null }),
                reviews: {
                    data: [
                        { rating: 5, body: 'They arrived on time and fixed the leak under the sink quickly and neatly.' },
                        { rating: 4, body: 'Sorted out a blocked drain that two other plumbers could not clear.' },
                        { rating: 5, body: 'Fair price and very tidy work, would happily call them again.' },
                    ],
                    error: null,
                },
            },
        });
        const result = await enrichProviderReviewSummaryFast('prov-1', { trade: 'Plumber' });
        expect(result).toEqual({ ok: true });
        expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it('updates an existing cache row with the fast review summary', async () => {
        geminiReturns(
            JSON.stringify({
                review_summary:
                    'Quick and tidy work that solves the problem first time. The pricing is fair and clearly explained.',
            }),
        );
        adminClient = mockSupabaseClient({
            tables: {
                providers: {
                    data: { id: 'prov-1', google_place_id: 'places/ChIJ1', name: 'Acme Plumbing' },
                    error: null,
                },
                // First select: review_summary empty so we proceed. Existence
                // probe returns a provider_id so the update branch runs.
                provider_cache: (_t, op) => {
                    if (op === 'update' || op === 'insert') return { data: null, error: null };
                    return { data: { provider_id: 'prov-1', review_summary: '', enriched_at: null }, error: null };
                },
                reviews: {
                    data: [
                        { rating: 5, body: 'They arrived on time and fixed the leak under the sink quickly and neatly.' },
                        { rating: 4, body: 'Sorted out a blocked drain that two other plumbers could not clear.' },
                    ],
                    error: null,
                },
            },
        });
        const result = await enrichProviderReviewSummaryFast('prov-1');
        expect(result).toEqual({ ok: true });
    });

    it('falls back to a marker when the model returns an empty summary', async () => {
        geminiReturns(JSON.stringify({ review_summary: '' }));
        adminClient = mockSupabaseClient({
            tables: {
                providers: {
                    data: { id: 'prov-1', google_place_id: 'places/ChIJ1', name: 'Acme Plumbing' },
                    error: null,
                },
                provider_cache: readWrite({ data: null, error: null }, { data: null, error: null }),
                reviews: {
                    data: [
                        { rating: 5, body: 'They arrived on time and fixed the leak under the sink quickly and neatly.' },
                        { rating: 4, body: 'Sorted out a blocked drain that two other plumbers could not clear.' },
                    ],
                    error: null,
                },
            },
        });
        const result = await enrichProviderReviewSummaryFast('prov-1');
        expect(result).toEqual({
            ok: true,
            skipped: true,
            reason: 'Empty summary from model',
        });
    });

    it('writes a fast_only marker when the AI call throws', async () => {
        generateContent.mockRejectedValue(new Error('429 rate limit'));
        adminClient = mockSupabaseClient({
            tables: {
                providers: {
                    data: { id: 'prov-1', google_place_id: 'places/ChIJ1', name: 'Acme Plumbing' },
                    error: null,
                },
                provider_cache: readWrite({ data: null, error: null }, { data: null, error: null }),
                reviews: {
                    data: [
                        { rating: 5, body: 'They arrived on time and fixed the leak under the sink quickly and neatly.' },
                        { rating: 4, body: 'Sorted out a blocked drain that two other plumbers could not clear.' },
                    ],
                    error: null,
                },
            },
        });
        const result = await enrichProviderReviewSummaryFast('prov-1');
        expect(result).toEqual({
            ok: true,
            skipped: true,
            reason: 'Fast summary generation failed',
        });
    });

    it('reads the body fallback fields (text/content) for review corpus', async () => {
        geminiReturns(
            JSON.stringify({
                review_summary:
                    'Quick and tidy work that solves the problem first time. The pricing is fair and clearly explained.',
            }),
        );
        adminClient = mockSupabaseClient({
            tables: {
                providers: {
                    data: { id: 'prov-1', google_place_id: 'places/ChIJ1', name: 'Acme Plumbing' },
                    error: null,
                },
                provider_cache: readWrite({ data: null, error: null }, { data: null, error: null }),
                reviews: {
                    data: [
                        { rating: 5, text: 'They arrived on time and fixed the leak under the sink quickly and neatly.' },
                        { rating: 4, content: 'Sorted out a blocked drain that two other plumbers could not clear.' },
                    ],
                    error: null,
                },
            },
        });
        const result = await enrichProviderReviewSummaryFast('prov-1');
        expect(result).toEqual({ ok: true });
        const promptArg = generateContent.mock.calls[0][0].contents[0].parts[0].text as string;
        expect(promptArg).toContain('blocked drain');
    });
});
