// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Durable funnel stamp for the "Matches Shown" stage. The match page calls this
// once, when provider results first render for a diagnosis. Unlike the old
// `match_view` analytics event, this writes durable state to diagnosis_funnel
// (first write wins), so the funnel survives UI refactors.

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { stampMatchesShown } from '@/lib/analytics/funnel';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
    // Reuse the cheap analytics bucket; this is a fire-and-forget telemetry write.
    const limited = await checkRateLimit(req, 'analyticsEvents');
    if (limited) return limited;

    const { id } = await context.params;
    const diagnosisId = String(id || '').trim();
    if (!diagnosisId || !UUID_RE.test(diagnosisId)) {
        return NextResponse.json({ error: 'Invalid diagnosis id' }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as { matchCount?: unknown } | null;
    const rawCount = body?.matchCount;
    const matchCount =
        typeof rawCount === 'number' && Number.isFinite(rawCount) ? rawCount : 0;

    await stampMatchesShown(diagnosisId, matchCount);
    return NextResponse.json({ ok: true });
}
