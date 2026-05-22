// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

/**
 * POST /api/diagnoses/direct
 *
 * Creates a minimal diagnoses row for homeowners who skip the AI pipeline and
 * go straight to the match page ("I know what I need"). No Gemini call.
 *
 * Body:
 *   trade        — one of the canonical SERVICE_LABELS (required)
 *   description  — free-text description of the issue (optional, max 500 chars)
 *   address      — geocoded address string (optional)
 *   lat          — latitude (optional)
 *   lng          — longitude (optional)
 *   conversationId — UUID generated client-side (required)
 *
 * Returns: { id: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { SERVICE_LABELS } from '@/lib/services';
import { toTitleCase } from '@/lib/services';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_TRADES = new Set<string>(SERVICE_LABELS);

type DirectMatchBody = {
    conversationId?: string;
    trade?: string;
    description?: string;
    address?: string;
    lat?: number;
    lng?: number;
};

export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, 'directMatch');
    if (limited) return limited;

    let body: DirectMatchBody;
    try {
        body = (await req.json()) as DirectMatchBody;
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const conversationId = String(body.conversationId ?? '').trim();
    if (!conversationId || !UUID_RE.test(conversationId)) {
        return NextResponse.json({ error: 'Invalid or missing conversationId' }, { status: 400 });
    }

    const trade = String(body.trade ?? '').trim();
    if (!trade || !ALLOWED_TRADES.has(trade)) {
        return NextResponse.json(
            { error: `Invalid trade. Must be one of: ${SERVICE_LABELS.join(', ')}` },
            { status: 400 },
        );
    }

    const rawDescription = String(body.description ?? '').trim().slice(0, 500);
    // Use the description as the diagnosis title if provided, otherwise fall back to trade label.
    const diagnosisTitle = rawDescription
        ? toTitleCase(rawDescription.slice(0, 75))
        : trade;

    const address = typeof body.address === 'string' ? body.address.trim() : null;
    const lat = typeof body.lat === 'number' && Number.isFinite(body.lat) ? body.lat : null;
    const lng = typeof body.lng === 'number' && Number.isFinite(body.lng) ? body.lng : null;

    // Minimal JSONB diagnosis object — the match page reads trade + trade_detail
    // from this to filter contractors. No AI fields are populated.
    // structural_confidence is fixed at 100 because the trade was hand-picked by
    // the user — no model uncertainty to gate on.
    const diagnosisJsonb = {
        trade,
        trade_detail: `Direct Match — ${trade}`,
        diagnosis: diagnosisTitle,
        thought: '',
        message: rawDescription || `Looking for a ${trade} contractor.`,
        action_required: '',
        confidence: 100,
        is_direct_match: true,
        structural_confidence: {
            score: 100,
            signals: {
                hasImage: false,
                imageCount: 0,
                descriptionWordCount: rawDescription
                    ? rawDescription.trim().split(/\s+/).filter(Boolean).length
                    : 0,
                subcategoryMatched: false,
                failedComponentNamed: false,
                isCatchAllWithNoVisual: false,
                isRejectedOrUnserviced: false,
            },
        },
    };

    try {
        const admin = await createSupabaseAdminClient();

        const { data, error } = await admin
            .from('diagnoses')
            .upsert(
                {
                    id: conversationId,
                    diagnosis: diagnosisJsonb,
                    initial_image_description: rawDescription || null,
                    customer_address: address,
                    customer_lat: lat,
                    customer_lng: lng,
                    is_direct_match: true,
                },
                { onConflict: 'id' },
            )
            .select('id')
            .single();

        if (error) {
            console.error('[diagnoses/direct] upsert error', { message: error.message });
            return NextResponse.json({ error: 'Failed to create record' }, { status: 500 });
        }

        return NextResponse.json({ id: data.id });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Server error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
