/* eslint-disable no-console */
/**
 * Contractor reply to a homeowner Mendr review (`job_outcomes` row).
 *
 * POST body: { reply: string }
 *
 * Auth & ownership:
 *   - Must be authenticated.
 *   - The signed-in user must own the provider linked to this job_outcome,
 *     via `provider_applications.user_id` → `matched_provider_id`.
 *
 * Validation:
 *   - Reply trimmed length between 5 and 1000 characters.
 *
 * Edit window:
 *   - First reply (contractor_reply_at IS NULL) is always allowed.
 *   - Edits are allowed while less than 24 hours have elapsed since the
 *     existing `contractor_reply_at`. After that → 403.
 *
 * Rate-limited via the existing `contactContractor` bucket (20/min) — same
 * shape as a contractor-side outbound contact.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    createSupabaseAdminClient,
    createSupabaseServerClient,
} from '@/lib/auth/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

const MIN_REPLY_LEN = 5;
const MAX_REPLY_LEN = 1000;
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'contactContractor');
    if (limited) return limited;

    const { id: rawId } = await ctx.params;
    const outcomeId = (rawId ?? '').trim();
    if (!outcomeId || !UUID_RE.test(outcomeId)) {
        return NextResponse.json({ error: 'Invalid review id.' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as { reply?: unknown } | null;
    const rawReply = typeof body?.reply === 'string' ? body.reply : '';
    const reply = rawReply.trim();
    if (reply.length < MIN_REPLY_LEN || reply.length > MAX_REPLY_LEN) {
        return NextResponse.json(
            {
                error: `Reply must be between ${MIN_REPLY_LEN} and ${MAX_REPLY_LEN} characters.`,
            },
            { status: 400 },
        );
    }

    const admin = await createSupabaseAdminClient();

    // Load the outcome row to determine provider ownership + current reply state.
    const { data: outcome, error: outcomeError } = await admin
        .from('job_outcomes')
        .select('id, provider_id, contractor_reply, contractor_reply_at')
        .eq('id', outcomeId)
        .maybeSingle();

    if (outcomeError) {
        console.error('[contractor-reply] outcome lookup failed:', outcomeError);
        return NextResponse.json({ error: 'Failed to load review.' }, { status: 500 });
    }
    if (!outcome) {
        return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
    }

    // Ownership check: the signed-in user must own an approved application whose
    // matched_provider_id matches the outcome's provider.
    const { data: ownerApp, error: ownerErr } = await admin
        .from('provider_applications')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .eq('matched_provider_id', outcome.provider_id)
        .limit(1)
        .maybeSingle();

    if (ownerErr) {
        console.error('[contractor-reply] ownership check failed:', ownerErr);
        return NextResponse.json({ error: 'Failed to verify ownership.' }, { status: 500 });
    }
    if (!ownerApp) {
        return NextResponse.json(
            { error: 'You do not have permission to reply to this review.' },
            { status: 403 },
        );
    }

    // 24-hour edit window — measured from the existing contractor_reply_at, not
    // from the original outcome.created_at. First replies are always allowed.
    if (outcome.contractor_reply_at) {
        const elapsed = Date.now() - new Date(outcome.contractor_reply_at).getTime();
        if (!Number.isFinite(elapsed) || elapsed > EDIT_WINDOW_MS) {
            return NextResponse.json(
                { error: 'Reply window has closed.' },
                { status: 403 },
            );
        }
    }

    const nowIso = new Date().toISOString();
    const { data: updated, error: updateError } = await admin
        .from('job_outcomes')
        .update({
            contractor_reply: reply,
            contractor_reply_at: nowIso,
        })
        .eq('id', outcomeId)
        .select('contractor_reply, contractor_reply_at')
        .single();

    if (updateError || !updated) {
        console.error('[contractor-reply] update failed:', updateError);
        return NextResponse.json({ error: 'Failed to save reply.' }, { status: 500 });
    }

    return NextResponse.json({
        ok: true,
        contractor_reply: updated.contractor_reply,
        contractor_reply_at: updated.contractor_reply_at,
    });
}
