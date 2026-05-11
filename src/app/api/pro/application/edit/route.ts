/**
 * Public edit API for contractor applicants.
 *
 * GET  /api/pro/application/edit?token=<raw>
 *   Validates the token and returns the safe application payload for editing.
 *
 * POST /api/pro/application/edit
 *   Validates the token and saves the applicant's edited summary + profile fields.
 *
 * Rate-limited via Upstash to prevent token enumeration.
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

// ─── Token validation ─────────────────────────────────────────────────────────

async function validateToken(
    admin: Awaited<ReturnType<typeof createSupabaseAdminClient>>,
    rawToken: string,
): Promise<{ valid: false; error: string } | { valid: true; tokenId: string; applicationId: string }> {
    if (!rawToken || rawToken.length < 32) return { valid: false, error: 'Invalid token' };

    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const { data: token, error } = await admin
        .from('provider_application_edit_tokens')
        .select('id, provider_application_id, expires_at, used_at, revoked_at')
        .eq('token_hash', hash)
        .maybeSingle();

    if (error || !token) return { valid: false, error: 'Token not found' };
    if (token.revoked_at) return { valid: false, error: 'This link has been revoked' };
    if (token.used_at)    return { valid: false, error: 'This link has already been used' };
    if (new Date(token.expires_at) < new Date()) return { valid: false, error: 'This link has expired' };

    return { valid: true, tokenId: token.id, applicationId: token.provider_application_id };
}

// ─── GET — load edit page payload ────────────────────────────────────────────

export async function GET(req: NextRequest) {
    const limited = checkRateLimit(req, 'applicationEdit');
    if (limited) return limited;

    const rawToken = req.nextUrl.searchParams.get('token') ?? '';
    const admin    = await createSupabaseAdminClient();

    const validation = await validateToken(admin, rawToken);
    if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 401 });
    }

    const { data: app, error } = await admin
        .from('provider_applications')
        .select('id, contact_name, business_name, trade, gemini_summary, applicant_summary')
        .eq('id', validation.applicationId)
        .single();

    if (error || !app) {
        return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    return NextResponse.json({
        applicationId:   app.id,
        contactName:     app.contact_name,
        businessName:    app.business_name,
        trade:           app.trade,
        // Prefer applicant's last saved edit; fall back to Gemini summary
        currentSummary:  app.applicant_summary || app.gemini_summary || '',
        geminiSummary:   app.gemini_summary,
        hasEdited:       !!app.applicant_summary,
    });
}

// ─── POST — save applicant edits ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
    const limited = checkRateLimit(req, 'applicationEdit');
    if (limited) return limited;

    const body     = await req.json().catch(() => null);
    const rawToken = typeof body?.token   === 'string' ? body.token.trim()   : '';
    const summary  = typeof body?.summary === 'string' ? body.summary.trim() : '';

    if (!rawToken) return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    if (!summary)  return NextResponse.json({ error: 'Summary cannot be empty' }, { status: 400 });
    if (summary.length > 2000) {
        return NextResponse.json({ error: 'Summary is too long (max 2000 characters)' }, { status: 400 });
    }

    const admin = await createSupabaseAdminClient();

    const validation = await validateToken(admin, rawToken);
    if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 401 });
    }

    // Parse optional structured profile edits from request body
    const profileEdits: Record<string, unknown> = {};
    if (typeof body?.phone   === 'string' && body.phone.trim())   profileEdits.phone   = body.phone.trim();
    if (typeof body?.website === 'string' && body.website.trim()) profileEdits.website = body.website.trim();

    const now = new Date().toISOString();

    // Save edits to provider_applications
    const { error: saveError } = await admin
        .from('provider_applications')
        .update({
            applicant_summary:      summary,
            applicant_edited_at:    now,
            applicant_profile_edits: Object.keys(profileEdits).length > 0 ? profileEdits : null,
        })
        .eq('id', validation.applicationId);

    if (saveError) {
        return NextResponse.json({ error: `Failed to save: ${saveError.message}` }, { status: 500 });
    }

    // Mark the token as used (one-time use)
    await admin
        .from('provider_application_edit_tokens')
        .update({ used_at: now })
        .eq('id', validation.tokenId);

    return NextResponse.json({ ok: true });
}
