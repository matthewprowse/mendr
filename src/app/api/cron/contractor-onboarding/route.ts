/**
 * Cron job: send day-3 and day-7 onboarding emails to approved contractors.
 *
 * Day-3: sent if approved_at is 3–4 days ago and onboarding_d3_sent_at IS NULL.
 * Day-7: sent if approved_at is 7–8 days ago and onboarding_d7_sent_at IS NULL.
 *
 * Query params:
 *   ?dryRun=true   — log what would be sent without sending
 *   ?day=3         — only run day-3 batch
 *   ?day=7         — only run day-7 batch
 *   (default: both)
 *
 * Auth: Bearer <CRON_SECRET>
 */

import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/auth/cron-auth';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { sendMendrEmail, generateUnsubscribeUrl } from '@/lib/email';
import { getSiteUrl } from '@/lib/site-url';
import {
    ContractorOnboardingDay3Email,
    contractorOnboardingDay3Text,
} from '@/lib/email/templates/contractor-onboarding-day3';
import {
    ContractorOnboardingDay7Email,
    contractorOnboardingDay7Text,
} from '@/lib/email/templates/contractor-onboarding-day7';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApplicationRow {
    id: string;
    contact_name: string;
    email: string;
    business_name: string | null;
}

// ── Handler ───────────────────────────────────────────────────────────────────

async function handler(req: NextRequest): Promise<NextResponse> {
    // Auth check must be first
    if (!isAuthorizedCronRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const dryRun   = req.nextUrl.searchParams.get('dryRun') === 'true';
    const dayParam = req.nextUrl.searchParams.get('day');
    const sendDay3 = dayParam === null || dayParam === '3';
    const sendDay7 = dayParam === null || dayParam === '7';

    const siteUrl = getSiteUrl();
    const admin   = await createSupabaseAdminClient();

    const now = Date.now();

    // Day windows (ms)
    const DAY_MS = 24 * 60 * 60 * 1000;
    const d3Start = new Date(now - 4 * DAY_MS).toISOString();
    const d3End   = new Date(now - 3 * DAY_MS).toISOString();
    const d7Start = new Date(now - 8 * DAY_MS).toISOString();
    const d7End   = new Date(now - 7 * DAY_MS).toISOString();

    let d3Sent = 0;
    let d3Skipped = 0;
    let d7Sent = 0;
    let d7Skipped = 0;

    // ── Day-3 batch ──────────────────────────────────────────────────────────

    if (sendDay3) {
        const { data: d3Rows, error: d3Error } = await admin
            .from('provider_applications')
            .select('id, contact_name, email, business_name')
            .eq('status', 'approved')
            .gte('approved_at', d3Start)
            .lte('approved_at', d3End)
            .is('onboarding_d3_sent_at', null);

        if (d3Error) {
            console.error('[contractor-onboarding] day-3 fetch error:', JSON.stringify(d3Error));
            return NextResponse.json({ error: 'Failed to fetch day-3 candidates.' }, { status: 500 });
        }

        for (const row of (d3Rows ?? []) as ApplicationRow[]) {
            if (!row.email) { d3Skipped++; continue; }

            const email = row.email.toLowerCase();

            // Check suppression list
            const { data: suppression } = await admin
                .from('email_suppressions')
                .select('email')
                .eq('email', email)
                .maybeSingle();

            if (suppression) { d3Skipped++; continue; }

            const firstName    = (row.contact_name ?? '').split(/\s+/)[0] || 'there';
            const profileUrl   = `${siteUrl}/contractors/(portal)/account`;
            const unsubscribeUrl = generateUnsubscribeUrl(email);

            if (dryRun) {
                console.error('[contractor-onboarding] dryRun day-3 — would send to:', JSON.stringify({ email, firstName }));
                d3Sent++;
                continue;
            }

            const result = await sendMendrEmail({
                to:        { email, name: row.contact_name ?? undefined },
                subject:   `${firstName}, your profile still needs a few finishing touches | Mendr`,
                component: React.createElement(ContractorOnboardingDay3Email, {
                    firstName,
                    profileUrl,
                    unsubscribeUrl,
                }),
                text: contractorOnboardingDay3Text({ firstName, profileUrl, unsubscribeUrl }),
                tags: ['contractor-onboarding', 'onboarding-d3'],
            });

            if (!result.ok) {
                console.error('[contractor-onboarding] day-3 send failed:', JSON.stringify({ email, error: result.error }));
                d3Skipped++;
                continue;
            }

            // Mark sent
            const { error: markError } = await admin
                .from('provider_applications')
                .update({ onboarding_d3_sent_at: new Date().toISOString() })
                .eq('id', row.id);

            if (markError) {
                console.error('[contractor-onboarding] day-3 mark error:', JSON.stringify({ id: row.id, error: markError }));
            }

            d3Sent++;
        }
    }

    // ── Day-7 batch ──────────────────────────────────────────────────────────

    if (sendDay7) {
        const { data: d7Rows, error: d7Error } = await admin
            .from('provider_applications')
            .select('id, contact_name, email, business_name')
            .eq('status', 'approved')
            .gte('approved_at', d7Start)
            .lte('approved_at', d7End)
            .is('onboarding_d7_sent_at', null);

        if (d7Error) {
            console.error('[contractor-onboarding] day-7 fetch error:', JSON.stringify(d7Error));
            return NextResponse.json({ error: 'Failed to fetch day-7 candidates.' }, { status: 500 });
        }

        for (const row of (d7Rows ?? []) as ApplicationRow[]) {
            if (!row.email) { d7Skipped++; continue; }

            const email = row.email.toLowerCase();

            // Check suppression list
            const { data: suppression } = await admin
                .from('email_suppressions')
                .select('email')
                .eq('email', email)
                .maybeSingle();

            if (suppression) { d7Skipped++; continue; }

            const firstName      = (row.contact_name ?? '').split(/\s+/)[0] || 'there';
            const leadsUrl       = `${siteUrl}/contractors/(portal)/network`;
            const unsubscribeUrl = generateUnsubscribeUrl(email);

            if (dryRun) {
                console.error('[contractor-onboarding] dryRun day-7 — would send to:', JSON.stringify({ email, firstName }));
                d7Sent++;
                continue;
            }

            const result = await sendMendrEmail({
                to:        { email, name: row.contact_name ?? undefined },
                subject:   `${firstName}, your first Mendr lead could be this week | Mendr`,
                component: React.createElement(ContractorOnboardingDay7Email, {
                    firstName,
                    leadsUrl,
                    siteUrl,
                    unsubscribeUrl,
                }),
                text: contractorOnboardingDay7Text({ firstName, leadsUrl, siteUrl, unsubscribeUrl }),
                tags: ['contractor-onboarding', 'onboarding-d7'],
            });

            if (!result.ok) {
                console.error('[contractor-onboarding] day-7 send failed:', JSON.stringify({ email, error: result.error }));
                d7Skipped++;
                continue;
            }

            // Mark sent
            const { error: markError } = await admin
                .from('provider_applications')
                .update({ onboarding_d7_sent_at: new Date().toISOString() })
                .eq('id', row.id);

            if (markError) {
                console.error('[contractor-onboarding] day-7 mark error:', JSON.stringify({ id: row.id, error: markError }));
            }

            d7Sent++;
        }
    }

    return NextResponse.json({
        dryRun,
        day3: sendDay3 ? { sent: d3Sent, skipped: d3Skipped } : 'skipped',
        day7: sendDay7 ? { sent: d7Sent, skipped: d7Skipped } : 'skipped',
    });
}

export const GET  = handler;
export const POST = handler;
