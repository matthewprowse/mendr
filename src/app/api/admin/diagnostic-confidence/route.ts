// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, ADMIN_PASSWORD
//
// Phase 4 — admin-only endpoint that returns aggregate structural-confidence
// statistics over the most recent N diagnoses. Used by the admin analytics page
// to monitor how the new structural score is distributing in production and
// which signals are dragging scores below the provider-surfacing threshold.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { requireAdmin } from '@/lib/auth/admin-auth';
import { STRUCTURAL_CONFIDENCE_PROVIDER_THRESHOLD } from '@/lib/diagnosis/structural-confidence';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

type Signals = {
    hasImage: boolean;
    imageCount: number;
    descriptionWordCount: number;
    subcategoryMatched: boolean;
    failedComponentNamed: boolean;
    isCatchAllWithNoVisual: boolean;
    isRejectedOrUnserviced: boolean;
};

export async function GET(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const { searchParams } = new URL(req.url);
    const limitRaw = Number.parseInt(searchParams.get('limit') ?? '', 10);
    const limit =
        Number.isFinite(limitRaw) && limitRaw > 0
            ? Math.min(limitRaw, MAX_LIMIT)
            : DEFAULT_LIMIT;

    const admin = await createSupabaseAdminClient();

    const { data, error } = await admin
        .from('diagnoses')
        .select('id, created_at, diagnosis')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = Array.isArray(data) ? data : [];
    const samples = rows
        .map((r) => {
            const diag = (r as { diagnosis?: unknown }).diagnosis;
            if (!diag || typeof diag !== 'object') return null;
            const structural = (diag as { structural_confidence?: unknown }).structural_confidence;
            if (!structural || typeof structural !== 'object') return null;
            const score = (structural as { score?: unknown }).score;
            const signals = (structural as { signals?: unknown }).signals;
            if (typeof score !== 'number' || !Number.isFinite(score)) return null;
            if (!signals || typeof signals !== 'object') return null;
            return {
                id: (r as { id: string }).id,
                created_at: (r as { created_at: string }).created_at,
                score: Math.round(score),
                signals: signals as Signals,
            };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

    const total = samples.length;

    // Histogram buckets: 0–69, 70–89, 90–100
    const belowThreshold = samples.filter((s) => s.score < STRUCTURAL_CONFIDENCE_PROVIDER_THRESHOLD).length;
    const midRange = samples.filter((s) => s.score >= STRUCTURAL_CONFIDENCE_PROVIDER_THRESHOLD && s.score < 90).length;
    const highRange = samples.filter((s) => s.score >= 90).length;

    // For below-threshold samples, count which signals are dragging scores down.
    const belowSamples = samples.filter((s) => s.score < STRUCTURAL_CONFIDENCE_PROVIDER_THRESHOLD);
    const signalCounters: Array<{ key: keyof Signals | 'tooShortDescription'; label: string; count: number }> = [
        { key: 'hasImage', label: 'No image provided', count: belowSamples.filter((s) => !s.signals.hasImage).length },
        { key: 'subcategoryMatched', label: 'No taxonomy subcategory match', count: belowSamples.filter((s) => !s.signals.subcategoryMatched).length },
        { key: 'failedComponentNamed', label: 'No specific failed component named', count: belowSamples.filter((s) => !s.signals.failedComponentNamed).length },
        { key: 'isCatchAllWithNoVisual', label: 'Catch-all trade with no image', count: belowSamples.filter((s) => s.signals.isCatchAllWithNoVisual).length },
        { key: 'tooShortDescription', label: 'Description shorter than 25 words', count: belowSamples.filter((s) => s.signals.descriptionWordCount < 25).length },
        { key: 'isRejectedOrUnserviced', label: 'Rejected / unserviced / N/A trade', count: belowSamples.filter((s) => s.signals.isRejectedOrUnserviced).length },
    ];
    const topBelowSignals = [...signalCounters]
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    return NextResponse.json({
        threshold: STRUCTURAL_CONFIDENCE_PROVIDER_THRESHOLD,
        sampleSize: total,
        requestedLimit: limit,
        histogram: {
            below: belowThreshold,
            mid: midRange,
            high: highRange,
        },
        topBelowSignals,
    });
}
