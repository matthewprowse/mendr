/**
 * POST /api/diagnose/refinement — count and enforce the per-diagnosis refinement
 * fair-use cap (Phase 2 of the onboarding plan).
 *
 * Called from the diagnosis page only on a user-initiated Refine (the "Refresh
 * Findings" action), never on the model's own clarifying questions or the
 * warm-up/hydration calls. Atomically-ish increments `diagnoses.refinement_count`
 * and returns 429 once the limit is exceeded, so the client can stop the refine
 * and prompt the user to start a new diagnosis. The diagnosis generation path
 * (`/api/diagnose`) is intentionally left untouched.
 *
 * Tied to the same kill switch as the daily quota: when
 * DISABLE_DIAGNOSIS_DAILY_QUOTA is set, the cap is a no-op.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, isRateLimitBypassed } from '@/lib/rate-limit-config';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';

const REFINEMENT_LIMIT = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'diagnose');
    if (limited) return limited;

    const body = (await req.json().catch(() => ({}))) as { conversationId?: unknown };
    const conversationId =
        typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
    if (!conversationId || !UUID_RE.test(conversationId)) {
        return NextResponse.json({ error: 'A valid conversationId is required.' }, { status: 400 });
    }

    // Kill switch — when the quota is disabled, do not count or cap.
    if (process.env.DISABLE_DIAGNOSIS_DAILY_QUOTA === 'true' || isRateLimitBypassed(req)) {
        return NextResponse.json({ ok: true, capped: false });
    }

    let admin: Awaited<ReturnType<typeof createSupabaseAdminClient>>;
    try {
        admin = await createSupabaseAdminClient();
    } catch {
        // Never block a refine on infra failure.
        return NextResponse.json({ ok: true, capped: false });
    }

    const { data, error } = await admin
        .from('diagnoses')
        .select('refinement_count')
        .eq('id', conversationId)
        .maybeSingle();

    if (error || !data) {
        // Unknown conversation or read failure — allow the refine through.
        return NextResponse.json({ ok: true, capped: false });
    }

    const current = (data as { refinement_count: number | null }).refinement_count ?? 0;
    if (current >= REFINEMENT_LIMIT) {
        return NextResponse.json(
            { error: 'refinement_limit', limit: REFINEMENT_LIMIT, used: current },
            { status: 429 }
        );
    }

    const { error: updateError } = await admin
        .from('diagnoses')
        .update({ refinement_count: current + 1 })
        .eq('id', conversationId);

    if (updateError) {
        // Counting failed — do not block the user.
        return NextResponse.json({ ok: true, capped: false });
    }

    return NextResponse.json({ ok: true, capped: false, used: current + 1, limit: REFINEMENT_LIMIT });
}
