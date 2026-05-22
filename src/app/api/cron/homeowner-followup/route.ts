/**
 * Cron: homeowner post-diagnosis follow-up
 *
 * Runs every 4 hours (or on demand). Sends PostDiagnosisFollowupEmail to
 * homeowners whose diagnosis was created 72–96 hours ago and who haven't yet
 * received a follow-up.
 *
 * Trigger via Vercel cron or manually:
 *   GET/POST /api/cron/homeowner-followup
 *   GET/POST /api/cron/homeowner-followup?dryRun=true
 *
 * Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/auth/cron-auth';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { sendMendrEmail, generateUnsubscribeUrl } from '@/lib/email';
import { PostDiagnosisFollowupEmail, postDiagnosisFollowupText } from '@/lib/email/templates/post-diagnosis-followup';
import { getSiteUrl } from '@/lib/site-url';
import React from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Lower bound: diagnoses older than this are eligible for follow-up. */
const WINDOW_START_HOURS = 72;
/** Upper bound: diagnoses newer than this are still within the send window. */
const WINDOW_END_HOURS   = 96;

// ── Helpers ───────────────────────────────────────────────────────────────────

type Urgency = 'low' | 'moderate' | 'high' | 'emergency';

function toUrgency(raw: unknown): Urgency {
    if (raw === 'low' || raw === 'moderate' || raw === 'high' || raw === 'emergency') {
        return raw;
    }
    return 'moderate';
}

function extractFaultTitle(diagnosis: unknown, fallback: string): string {
    if (
        diagnosis !== null &&
        typeof diagnosis === 'object' &&
        'title' in diagnosis &&
        typeof (diagnosis as { title: unknown }).title === 'string'
    ) {
        return (diagnosis as { title: string }).title;
    }
    return fallback;
}

function extractUrgency(diagnosis: unknown): Urgency {
    if (
        diagnosis !== null &&
        typeof diagnosis === 'object' &&
        'urgency' in diagnosis
    ) {
        return toUrgency((diagnosis as { urgency: unknown }).urgency);
    }
    return 'moderate';
}

// ── Handler ───────────────────────────────────────────────────────────────────

async function handler(req: NextRequest): Promise<NextResponse> {
    // Auth check must be first — before any DB calls.
    if (!isAuthorizedCronRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const dryRun  = req.nextUrl.searchParams.get('dryRun') === 'true';
    const siteUrl = getSiteUrl();
    const admin   = await createSupabaseAdminClient();

    const now       = Date.now();
    const windowEnd   = new Date(now - WINDOW_START_HOURS * 60 * 60 * 1000).toISOString();
    const windowStart = new Date(now - WINDOW_END_HOURS   * 60 * 60 * 1000).toISOString();

    // Fetch diagnoses in the 72–96 h window that haven't had a follow-up sent.
    const { data: rows, error: fetchError } = await admin
        .from('diagnoses')
        .select('id, diagnosis, homeowner_email, user_id')
        .gte('created_at', windowStart)
        .lte('created_at', windowEnd)
        .is('followup_sent_at', null);

    if (fetchError) {
        console.error('[homeowner-followup] fetch error:', JSON.stringify(fetchError));
        return NextResponse.json({ error: 'Failed to fetch diagnoses.' }, { status: 500 });
    }

    let sent       = 0;
    let skipped    = 0;
    let suppressed = 0;

    for (const row of rows ?? []) {
        const diagnosisId: string = row.id as string;

        // Resolve homeowner email — prefer denormalised column, fall back to Auth.
        let homeownerEmail: string | null = (row.homeowner_email as string | null) ?? null;

        if (!homeownerEmail) {
            const userId = row.user_id as string | null;
            if (!userId) {
                skipped++;
                continue; // anonymous / guest — no email available
            }

            const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
            if (authErr || !authUser?.user?.email) {
                skipped++;
                continue;
            }
            homeownerEmail = authUser.user.email;
        }

        // Check suppression list.
        const { data: suppression } = await admin
            .from('email_suppressions')
            .select('email')
            .eq('email', homeownerEmail.toLowerCase())
            .maybeSingle();

        if (suppression) {
            suppressed++;
            continue;
        }

        // Build email params.
        const diagnosisObj = row.diagnosis as unknown;
        const faultTitle   = extractFaultTitle(diagnosisObj, 'home fault');
        const urgency      = extractUrgency(diagnosisObj);
        const reportUrl    = `${siteUrl}/report/${diagnosisId}`;
        const contractorsUrl = `${siteUrl}/match?diagnosisId=${diagnosisId}`;
        const unsubscribeUrl = generateUnsubscribeUrl(homeownerEmail);

        const emailProps = { reportUrl, faultTitle, urgency, contractorsUrl, unsubscribeUrl };

        if (dryRun) {
            console.error('[homeowner-followup] dryRun:', JSON.stringify({
                diagnosisId,
                email: homeownerEmail,
                faultTitle,
                urgency,
            }));
            sent++;
            continue;
        }

        const result = await sendMendrEmail({
            to:        { email: homeownerEmail },
            subject:   `Have you sorted your ${faultTitle}? | Mendr`,
            component: React.createElement(PostDiagnosisFollowupEmail, emailProps),
            text:      postDiagnosisFollowupText(emailProps),
            tags:      ['homeowner-followup'],
        });

        if (!result.ok) {
            console.error('[homeowner-followup] send failed:', JSON.stringify({
                diagnosisId,
                email:  homeownerEmail,
                error:  result.error,
            }));
            skipped++;
            continue;
        }

        // Mark as sent.
        const { error: updateError } = await admin
            .from('diagnoses')
            .update({ followup_sent_at: new Date().toISOString() })
            .eq('id', diagnosisId);

        if (updateError) {
            console.error('[homeowner-followup] followup_sent_at update failed:', JSON.stringify({
                diagnosisId,
                error: updateError,
            }));
        }

        sent++;
    }

    return NextResponse.json({ sent, skipped, suppressed, dryRun });
}

export const GET  = handler;
export const POST = handler;
