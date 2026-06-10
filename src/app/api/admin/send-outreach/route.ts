/* eslint-disable no-console */
/**
 * Admin-only endpoint to send cold outreach emails to unregistered contractors.
 *
 * Called manually by an admin — not a cron job.
 * Maximum 50 contractors per call.
 *
 * Request body:
 *   {
 *     contractors: Array<{
 *       email: string;
 *       businessName: string;
 *       contactCount: number;
 *       tradeType: string;
 *       month: string;
 *     }>;
 *     dryRun?: boolean;
 *   }
 *
 * Response:
 *   { sent: number; skipped: number; dryRun: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-auth';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { sendMendrEmail, generateUnsubscribeUrl } from '@/lib/email';
import { ContractorOutreachEmail, contractorOutreachText } from '@/lib/email/templates/contractor-outreach';
import { getSiteUrl } from '@/lib/site-url';
import React from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContractorTarget {
    email: string;
    businessName: string;
    contactCount: number;
    tradeType: string;
    month: string;
}

interface RequestBody {
    contractors: ContractorTarget[];
    dryRun?: boolean;
}

const MAX_PER_CALL = 50;

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
    // Admin auth is the first operation
    const deny = await requireAdmin(req);
    if (deny) return deny;

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const parsed = body as Partial<RequestBody>;

    if (!Array.isArray(parsed.contractors)) {
        return NextResponse.json(
            { error: 'Body must include a "contractors" array.' },
            { status: 400 },
        );
    }

    if (parsed.contractors.length > MAX_PER_CALL) {
        return NextResponse.json(
            { error: `Maximum ${MAX_PER_CALL} contractors per call.` },
            { status: 400 },
        );
    }

    // Validate each contractor entry. Outreach targets are inherently
    // client-supplied (cold emails to unregistered contractors), so apply a
    // basic email-format check as a guardrail (finding M6).
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const c of parsed.contractors) {
        if (
            typeof c.email !== 'string' ||
            !EMAIL_RE.test(c.email.trim()) ||
            typeof c.businessName !== 'string' ||
            typeof c.contactCount !== 'number' ||
            typeof c.tradeType !== 'string' ||
            typeof c.month !== 'string'
        ) {
            return NextResponse.json(
                {
                    error:
                        'Each contractor must have: email (string), businessName (string), contactCount (number), tradeType (string), month (string).',
                },
                { status: 400 },
            );
        }
    }

    const contractors = parsed.contractors as ContractorTarget[];
    const dryRun = parsed.dryRun === true;
    const siteUrl = getSiteUrl();
    const applyUrl = `${siteUrl}/pro/network`;

    const admin = await createSupabaseAdminClient();

    let sent = 0;
    let skipped = 0;

    for (const contractor of contractors) {
        const email = contractor.email.toLowerCase().trim();

        // Check suppression list — skip if suppressed
        const { data: suppression } = await admin
            .from('email_suppressions')
            .select('email')
            .eq('email', email)
            .maybeSingle();

        if (suppression) {
            skipped++;
            continue;
        }

        const unsubscribeUrl = generateUnsubscribeUrl(email);

        if (dryRun) {
            console.error('[send-outreach] dryRun — would send:', JSON.stringify({
                email,
                businessName: contractor.businessName,
                contactCount: contractor.contactCount,
            }));
            sent++;
            continue;
        }

        const result = await sendMendrEmail({
            to: { email, name: contractor.businessName },
            subject: `${contractor.contactCount} homeowner${contractor.contactCount === 1 ? '' : 's'} in your area | Mendr`,
            component: React.createElement(ContractorOutreachEmail, {
                businessName:  contractor.businessName,
                contactCount:  contractor.contactCount,
                tradeType:     contractor.tradeType,
                month:         contractor.month,
                applyUrl,
                unsubscribeUrl,
            }),
            text: contractorOutreachText({
                businessName:  contractor.businessName,
                contactCount:  contractor.contactCount,
                tradeType:     contractor.tradeType,
                month:         contractor.month,
                applyUrl,
                unsubscribeUrl,
            }),
            tags: ['contractor-outreach'],
        });

        if (!result.ok) {
            console.error('[send-outreach] send failed:', JSON.stringify({
                email,
                error: result.error,
            }));
            skipped++;
            continue;
        }

        sent++;
    }

    return NextResponse.json({ sent, skipped, dryRun });
}
