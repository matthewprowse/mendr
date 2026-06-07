/* eslint-disable no-console */
// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

/**
 * Public edit API for contractor applicants.
 *
 * GET  /api/contractors/application/edit?token=<raw>
 *   Validates the token and returns the safe application payload for editing.
 *
 * POST /api/contractors/application/edit
 *   Validates the token and saves the applicant's edited summary + profile fields.
 *
 * Rate-limited via Upstash to prevent token enumeration.
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
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
    const limited = await checkRateLimit(req, 'applicationEdit');
    if (limited) return limited;

    const rawToken = req.nextUrl.searchParams.get('token') ?? '';
    const admin    = await createSupabaseAdminClient();

    const validation = await validateToken(admin, rawToken);
    if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 401 });
    }

    const { data: appRaw, error } = await admin
        .from('provider_applications')
        .select(
            'id, contact_name, business_name, trade, gemini_summary, applicant_summary, highlights, trade_description, insurance_cover, typical_response_time, pricing_model, callout_fee, preferred_contact_channel',
        )
        .eq('id', validation.applicationId)
        .single();

    if (error || !appRaw) {
        return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    // New columns are not in the generated DB types yet; cast to the known shape.
    const app = appRaw as {
        id: string;
        contact_name: string | null;
        business_name: string | null;
        trade: string | null;
        gemini_summary: string | null;
        applicant_summary: string | null;
        highlights: string | null;
        trade_description: string | null;
        insurance_cover: string | null;
        typical_response_time: string | null;
        pricing_model: string | null;
        callout_fee: number | null;
        preferred_contact_channel: string | null;
    };

    return NextResponse.json({
        applicationId:   app.id,
        contactName:     app.contact_name,
        businessName:    app.business_name,
        trade:           app.trade,
        // Prefer applicant's last saved edit; fall back to Gemini summary
        currentSummary:  app.applicant_summary || app.gemini_summary || '',
        geminiSummary:   app.gemini_summary,
        hasEdited:       !!app.applicant_summary,
        highlights:              app.highlights ?? '',
        specialisations:         app.trade_description ?? '',
        insuranceCover:          app.insurance_cover ?? '',
        typicalResponseTime:     app.typical_response_time ?? '',
        pricingModel:            app.pricing_model ?? '',
        calloutFee:              typeof app.callout_fee === 'number' ? String(app.callout_fee) : '',
        preferredContactChannel: app.preferred_contact_channel ?? '',
    });
}

// ─── POST — save applicant edits ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, 'applicationEdit');
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
    const str = (v: unknown, max = 280): string | null =>
        typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
    const calloutFeeRaw = typeof body?.calloutFee === 'string' ? body.calloutFee.replace(/[^\d]/g, '') : '';
    const calloutFee = calloutFeeRaw ? parseInt(calloutFeeRaw, 10) : null;

    const profileEdits: Record<string, unknown> = {};
    if (typeof body?.phone   === 'string' && body.phone.trim())   profileEdits.phone   = body.phone.trim();
    if (typeof body?.website === 'string' && body.website.trim()) profileEdits.website = body.website.trim();

    const now = new Date().toISOString();

    // Persist the edited summary + structured service-terms fields onto the
    // application row. The promotion step below reads them back to write through
    // to the live providers profile. Only fields present in the request body are
    // touched, so callers that omit them never null out existing values.
    const appUpdate: Record<string, unknown> = {
        applicant_summary:       summary,
        applicant_edited_at:     now,
        applicant_profile_edits: Object.keys(profileEdits).length > 0 ? profileEdits : null,
    };
    if ('insuranceCover' in body) appUpdate.insurance_cover = str(body.insuranceCover);
    if ('typicalResponseTime' in body) appUpdate.typical_response_time = str(body.typicalResponseTime, 64);
    if ('pricingModel' in body) appUpdate.pricing_model = str(body.pricingModel);
    if ('preferredContactChannel' in body) appUpdate.preferred_contact_channel = str(body.preferredContactChannel, 32);
    if ('calloutFee' in body) appUpdate.callout_fee = Number.isFinite(calloutFee) ? calloutFee : null;
    if (typeof body?.highlights === 'string') appUpdate.highlights = body.highlights.trim() || null;
    if (typeof body?.specialisations === 'string') appUpdate.trade_description = body.specialisations.trim() || null;

    const { error: saveError } = await admin
        .from('provider_applications')
        .update(appUpdate)
        .eq('id', validation.applicationId);

    if (saveError) {
        return NextResponse.json({ error: `Failed to save: ${saveError.message}` }, { status: 500 });
    }

    // ── Promote the claim into the live providers profile ──────────────────────
    // Merge the application's structured data into the matched provider row and
    // stamp each populated field in `field_sources` as 'contractor' so the Google
    // enrichment pipeline never overwrites the contractor's own words.
    // Best-effort: the applicant_summary save above is the source of truth and has
    // already succeeded; a promotion failure is logged, not surfaced as an error.
    let claimed = false;
    try {
        const { data: appRaw } = await admin
            .from('provider_applications')
            .select(
                'matched_provider_id, user_id, founded_year, highlights, trade_description, business_name, address, phone, website, service_areas, insurance_cover, typical_response_time, pricing_model, callout_fee, preferred_contact_channel',
            )
            .eq('id', validation.applicationId)
            .maybeSingle();

        // New columns are not in the generated DB types yet; cast to the known shape.
        const app = appRaw as {
            matched_provider_id: string | null;
            user_id: string | null;
            founded_year: number | null;
            highlights: string | null;
            trade_description: string | null;
            business_name: string | null;
            address: string | null;
            phone: string | null;
            website: string | null;
            service_areas: Array<{ lat?: number; lng?: number; address?: string }> | null;
            insurance_cover: string | null;
            typical_response_time: string | null;
            pricing_model: string | null;
            callout_fee: number | null;
            preferred_contact_channel: string | null;
        } | null;

        const tokenize = (csv: unknown): string[] =>
            typeof csv === 'string' ? csv.split(',').map((t) => t.trim()).filter(Boolean) : [];

        // Build the contractor-owned field set + provenance stamps once. Used for
        // both the update (existing match) and insert (no match) paths below.
        const fieldSources: Record<string, string> = { about: 'contractor', summary_long: 'contractor' };
        const fields: Record<string, unknown> = { about: summary, summary_long: summary };

        const highlights = tokenize(app?.highlights);
        if (highlights.length > 0) {
            fields.highlights = highlights;
            fieldSources.highlights = 'contractor';
        }

        const specialisations = tokenize(app?.trade_description);
        if (specialisations.length > 0) {
            fields.specialisations = specialisations;
            fieldSources.specialisations = 'contractor';
        }

        const foundedYear = typeof app?.founded_year === 'number' ? app.founded_year : null;
        if (foundedYear && foundedYear > 1900) {
            const years = new Date().getFullYear() - foundedYear;
            if (years >= 0 && years < 200) {
                fields.years_in_business = years;
                fieldSources.years_in_business = 'contractor';
            }
        }

        // Contractor-only fields (enrichment never writes these) — copy straight across.
        const contractorOnly = [
            'insurance_cover',
            'typical_response_time',
            'pricing_model',
            'callout_fee',
            'preferred_contact_channel',
        ] as const;
        for (const key of contractorOnly) {
            const value = app?.[key];
            if (value !== null && value !== undefined && value !== '') fields[key] = value;
        }

        const userId = typeof app?.user_id === 'string' ? app.user_id : null;
        const providerId = typeof app?.matched_provider_id === 'string' ? app.matched_provider_id : null;

        if (providerId) {
            // Existing match → merge over the live row, preserving any prior sources.
            const { data: existingProvider } = await admin
                .from('providers')
                .select('field_sources')
                .eq('id', providerId)
                .maybeSingle();
            const mergedSources = {
                ...((existingProvider as { field_sources?: Record<string, string> | null } | null)
                    ?.field_sources ?? {}),
                ...fieldSources,
            };

            const { error: promoteError } = await admin
                .from('providers')
                .update({
                    ...fields,
                    field_sources: mergedSources,
                    claimed_at: now,
                    claimed_by_user_id: userId,
                    updated_at: now,
                })
                .eq('id', providerId);

            if (promoteError) {
                console.error(
                    JSON.stringify({
                        type: 'claim_promote_error',
                        application_id: validation.applicationId,
                        provider_id: providerId,
                        error: promoteError.message,
                    }),
                );
            } else {
                claimed = true;
            }
        } else if (app?.business_name) {
            // No match → create a contractor-owned provider row and link it back.
            const firstArea = Array.isArray(app.service_areas) ? app.service_areas[0] : null;
            const lat = firstArea && typeof firstArea.lat === 'number' ? firstArea.lat : null;
            const lng = firstArea && typeof firstArea.lng === 'number' ? firstArea.lng : null;
            fields.name = app.business_name;
            fieldSources.name = 'contractor';

            const { data: created, error: createError } = await admin
                .from('providers')
                .insert({
                    ...fields,
                    source: 'contractor',
                    address: app.address ?? null,
                    phone: app.phone ?? null,
                    website: app.website ?? null,
                    latitude: lat,
                    longitude: lng,
                    is_active: true,
                    field_sources: fieldSources,
                    claimed_at: now,
                    claimed_by_user_id: userId,
                })
                .select('id')
                .single();

            if (createError || !created?.id) {
                console.error(
                    JSON.stringify({
                        type: 'claim_create_provider_error',
                        application_id: validation.applicationId,
                        error: createError?.message ?? 'no id returned',
                    }),
                );
            } else {
                await admin
                    .from('provider_applications')
                    .update({ matched_provider_id: created.id })
                    .eq('id', validation.applicationId);
                claimed = true;
            }
        }
    } catch (err) {
        console.error(
            JSON.stringify({
                type: 'claim_promote_exception',
                application_id: validation.applicationId,
                error: err instanceof Error ? err.message : String(err),
            }),
        );
    }

    // Mark the token as used (one-time use)
    await admin
        .from('provider_application_edit_tokens')
        .update({ used_at: now })
        .eq('id', validation.tokenId);

    return NextResponse.json({ ok: true, claimed });
}
