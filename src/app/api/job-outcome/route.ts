/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { getSiteUrl } from '@/lib/site-url';

const VALID_RATINGS = new Set([1, 2, 3, 4, 5]);

/** GET /api/job-outcome?token=<uuid>&rating=<1-5> — one-click from email link */
export async function GET(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'jobOutcome');
    if (limited) return limited;

    const siteUrl = getSiteUrl();
    const tokenId = req.nextUrl.searchParams.get('token') ?? '';
    const ratingRaw = Number(req.nextUrl.searchParams.get('rating'));

    if (!tokenId || !VALID_RATINGS.has(ratingRaw)) {
        return NextResponse.redirect(`${siteUrl}/rate/invalid`);
    }

    const admin = await createSupabaseAdminClient();

    // Fetch and validate the token.
    const { data: token, error: tokenErr } = await admin
        .from('job_outcome_tokens')
        .select('id, contact_event_id, provider_id, diagnosis_id, user_id, used_at, expires_at')
        .eq('id', tokenId)
        .maybeSingle();

    if (tokenErr || !token) {
        return NextResponse.redirect(`${siteUrl}/rate/invalid`);
    }
    if (token.used_at) {
        return NextResponse.redirect(`${siteUrl}/rate/already-rated`);
    }
    if (new Date(token.expires_at as string) < new Date()) {
        return NextResponse.redirect(`${siteUrl}/rate/expired`);
    }

    // Save the outcome.
    const { error: insertErr } = await admin.from('job_outcomes').insert({
        token_id: token.id,
        contact_event_id: token.contact_event_id,
        provider_id: token.provider_id,
        diagnosis_id: token.diagnosis_id,
        user_id: token.user_id,
        rating: ratingRaw,
        outcome: 'job_done',
    });

    if (insertErr) {
        console.error('[job-outcome] insert error:', JSON.stringify(insertErr));
        return NextResponse.redirect(`${siteUrl}/rate/error`);
    }

    // Mark token as used.
    await admin
        .from('job_outcome_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('id', tokenId);

    return NextResponse.redirect(`${siteUrl}/rate/thanks?rating=${ratingRaw}`);
}
