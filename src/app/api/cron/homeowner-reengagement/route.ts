/* eslint-disable no-console */
/**
 * Cron: homeowner re-engagement emails.
 *
 * Finds homeowners who haven't returned in 90+ days and sends them a
 * re-engagement email. Runs on a Vercel Cron schedule (see vercel.json).
 *
 * Supports ?dryRun=true to log without sending.
 *
 * The `homeowner_emails` table is populated by the diagnose API (see
 * /api/diagnose/route.ts — TODO: upsert homeowner_emails on each diagnosis).
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/auth/cron-auth';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import {
    HomeownerReengagementEmail,
    homeownerReengagementText,
} from '@/lib/email/templates/homeowner-reengagement';
import { sendMendrEmail, generateUnsubscribeUrl } from '@/lib/email';
import { getSiteUrl } from '@/lib/site-url';
import React from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

/** How many days of inactivity before sending a re-engagement email. */
const INACTIVITY_DAYS = 90;

// ── Handler ───────────────────────────────────────────────────────────────────

async function handler(req: NextRequest): Promise<NextResponse> {
    // Cron auth is the first operation
    if (!isAuthorizedCronRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true';
    const siteUrl = getSiteUrl();

    const admin = await createSupabaseAdminClient();

    // Compute the cutoff timestamp (90 days ago)
    const cutoff = new Date(Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Find homeowners who are overdue for re-engagement
    const { data: candidates, error: fetchError } = await admin
        .from('homeowner_emails')
        .select('email, diagnosis_count, last_diagnosis_at')
        .lt('last_diagnosis_at', cutoff)
        .is('reengagement_sent_at', null);

    if (fetchError) {
        console.error('[homeowner-reengagement] fetch error:', JSON.stringify(fetchError));
        return NextResponse.json({ error: 'Failed to fetch candidates.' }, { status: 500 });
    }

    let sent = 0;
    let skipped = 0;
    let suppressed = 0;

    for (const row of candidates ?? []) {
        const email = (row.email as string | null)?.toLowerCase()?.trim();
        if (!email) {
            skipped++;
            continue;
        }

        // Check suppression list — skip if suppressed
        const { data: suppression } = await admin
            .from('email_suppressions')
            .select('email')
            .eq('email', email)
            .maybeSingle();

        if (suppression) {
            suppressed++;
            continue;
        }

        const unsubscribeUrl = generateUnsubscribeUrl(email);
        const diagnosisCount = (row.diagnosis_count as number | null) ?? 1;

        if (dryRun) {
            console.error('[homeowner-reengagement] dryRun — would send:', JSON.stringify({
                email,
                diagnosisCount,
            }));
            sent++;
            continue;
        }

        const result = await sendMendrEmail({
            to: { email },
            subject: `Your home won't fix itself — Mendr is still free`,
            component: React.createElement(HomeownerReengagementEmail, {
                diagnosisCount,
                lastFaultTitle: 'your last reported fault',
                siteUrl,
                unsubscribeUrl,
            }),
            text: homeownerReengagementText({
                diagnosisCount,
                lastFaultTitle: 'your last reported fault',
                siteUrl,
                unsubscribeUrl,
            }),
            tags: ['homeowner-reengagement'],
        });

        if (!result.ok) {
            console.error('[homeowner-reengagement] send failed:', JSON.stringify({
                email,
                error: result.error,
            }));
            skipped++;
            continue;
        }

        // Mark reengagement_sent_at so we don't re-send
        const { error: updateError } = await admin
            .from('homeowner_emails')
            .update({ reengagement_sent_at: new Date().toISOString() })
            .eq('email', email);

        if (updateError) {
            console.error('[homeowner-reengagement] update reengagement_sent_at error:', JSON.stringify({
                email,
                error: updateError,
            }));
        }

        sent++;
    }

    return NextResponse.json({ sent, skipped, suppressed, dryRun });
}

export const GET = handler;
export const POST = handler;
