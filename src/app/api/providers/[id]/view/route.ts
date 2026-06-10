// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Durable provider profile-view capture. Records one row per view in
// provider_profile_views. Honest counts use COUNT(DISTINCT session_id); the
// client fires at most once per provider per session. This replaces the dead
// `provider_profile_view` analytics event and feeds the admin Providers view
// count and the contractor views-vs-leads metric. Not a funnel stage.

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { analyticsSessionId } from '@/lib/analytics/session';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
    // Reuse the cheap analytics bucket; this is fire-and-forget telemetry.
    const limited = await checkRateLimit(req, 'analyticsEvents');
    if (limited) return limited;

    const { id } = await context.params;
    const providerId = String(id || '').trim();
    if (!providerId || !UUID_RE.test(providerId)) {
        return NextResponse.json({ error: 'Invalid provider id' }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as
        | { diagnosisId?: unknown; source?: unknown }
        | null;

    // Server-derived, not client-supplied, so distinct-session counts can't be
    // inflated (finding L3).
    const sessionId = analyticsSessionId(req);
    const diagnosisId =
        typeof body?.diagnosisId === 'string' && UUID_RE.test(body.diagnosisId.trim())
            ? body.diagnosisId.trim()
            : null;
    const source =
        body?.source === 'match' || body?.source === 'contractor_page' ? body.source : null;

    try {
        const admin = await createSupabaseAdminClient();
        await admin.from('provider_profile_views').insert({
            provider_id: providerId,
            diagnosis_id: diagnosisId,
            session_id: sessionId,
            source,
        });
    } catch {
        // Telemetry must never error the caller.
    }

    return NextResponse.json({ ok: true });
}
