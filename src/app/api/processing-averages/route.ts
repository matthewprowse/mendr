/**
 * GET /api/processing-averages
 *
 * Returns rolling-average latency per Gemini endpoint, computed from the most
 * recent rows of public.ai_cost_events. Used by the /processing page to show
 * dynamic time-remaining estimates instead of hardcoded guesses.
 *
 * Response shape:
 *   {
 *     classifyMs: number | null,
 *     proseMs: number | null,
 *     critiqueMs: number | null,
 *     reasoningMs: number | null,
 *     gateMs: number | null,
 *     sampleSize: number,
 *   }
 *
 * Any field may be null when no recent rows exist for that endpoint (caller
 * should fall back to a hardcoded default).
 *
 * No auth required — averages are aggregate, not user-specific. Cache 60s.
 */

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';

// How many recent rows per endpoint to average. Older rows are ignored to
// reflect current model performance (Gemini latency drifts as Google rolls
// out infra/version changes).
const ROLLING_WINDOW = 50;

type EndpointAverage = {
    endpoint: string;
    avg_ms: number;
    sample_size: number;
};

export async function GET() {
    try {
        const admin = await createSupabaseAdminClient();

        // Pull the most recent `latency_ms` values per endpoint, then average
        // them client-side. Doing this in a single RPC would be cleaner; this
        // direct-query approach avoids a migration round-trip and is still
        // bounded — `ROLLING_WINDOW` × (number of endpoints) rows max.
        const endpoints = [
            'diagnose/classify',
            'diagnose/prose',
            'diagnose/critique',
            'diagnose/reasoning',
            'diagnose/image-relevance-gate',
        ];

        const results = await Promise.all(
            endpoints.map(async (endpoint): Promise<EndpointAverage> => {
                const { data, error } = await admin
                    .from('ai_cost_events')
                    .select('latency_ms')
                    .eq('endpoint', endpoint)
                    .not('latency_ms', 'is', null)
                    .order('created_at', { ascending: false })
                    .limit(ROLLING_WINDOW);

                if (error || !data || data.length === 0) {
                    return { endpoint, avg_ms: 0, sample_size: 0 };
                }
                const total = data.reduce(
                    (sum, row) => sum + (row.latency_ms ?? 0),
                    0
                );
                return {
                    endpoint,
                    avg_ms: Math.round(total / data.length),
                    sample_size: data.length,
                };
            })
        );

        const byEndpoint = Object.fromEntries(
            results.map((r) => [r.endpoint, r.avg_ms || null])
        ) as Record<string, number | null>;

        const sampleSize = results.reduce((s, r) => s + r.sample_size, 0);

        return NextResponse.json(
            {
                classifyMs: byEndpoint['diagnose/classify'] ?? null,
                proseMs: byEndpoint['diagnose/prose'] ?? null,
                critiqueMs: byEndpoint['diagnose/critique'] ?? null,
                reasoningMs: byEndpoint['diagnose/reasoning'] ?? null,
                gateMs: byEndpoint['diagnose/image-relevance-gate'] ?? null,
                sampleSize,
            },
            {
                headers: {
                    // Cache 60s — averages are slow-moving and the processing
                    // page hits this on every mount.
                    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
                },
            }
        );
    } catch (err) {
        console.warn(
            JSON.stringify({
                type: 'processing_averages_error',
                error: err instanceof Error ? err.message : String(err),
            })
        );
        return NextResponse.json(
            {
                classifyMs: null,
                proseMs: null,
                critiqueMs: null,
                reasoningMs: null,
                gateMs: null,
                sampleSize: 0,
            },
            { status: 200 } // Caller falls back to hardcoded defaults.
        );
    }
}
