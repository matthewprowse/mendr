/* eslint-disable no-console */
import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { isAuthorizedCronRequest } from '@/lib/auth/cron-auth';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { sendMendrEmail } from '@/lib/email';
import {
    MonthlyDigestReactEmail,
    monthlyDigestReactText,
} from '@/lib/email/templates/monthly-digest-react';
import { getSiteUrl } from '@/lib/site-url';

function buildUnsubscribeToken(email: string, secret: string): string {
    const ts = Date.now().toString();
    const payload = `${email}:${ts}`;
    const payloadB64 = Buffer.from(payload).toString('base64url');
    const sig = createHmac('sha256', secret).update(payload).digest('base64url');
    return `${payloadB64}.${sig}`;
}

function getTargetMonthRange(override?: string): { start: Date; end: Date; label: string } {
    let base: Date;

    if (override) {
        const [year, month] = override.split('-').map(Number);
        if (!year || !month || month < 1 || month > 12) {
            throw new Error(`Invalid month parameter: ${override}`);
        }
        base = new Date(year, month - 1, 1, 0, 0, 0, 0);
    } else {
        const now = new Date();
        base = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    }

    const start = new Date(Date.UTC(base.getFullYear(), base.getMonth(), 1));
    const end = new Date(Date.UTC(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999));

    const label = start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    return { start, end, label };
}

async function handler(req: NextRequest): Promise<NextResponse> {
    if (!isAuthorizedCronRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const cronSecret = process.env.CRON_SECRET ?? '';
    const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true';
    const monthParam = req.nextUrl.searchParams.get('month') ?? undefined;

    let range: { start: Date; end: Date; label: string };
    try {
        range = getTargetMonthRange(monthParam);
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Invalid month parameter.' },
            { status: 400 }
        );
    }

    const { start, end, label: monthLabel } = range;
    const siteUrl = getSiteUrl();
    const admin = await createSupabaseAdminClient();

    const { data: events, error: eventsError } = await admin
        .from('provider_contact_events')
        .select('provider_id, diagnosis_trade')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .or('digest_sent_at.is.null,digest_sent_at.lt.' + start.toISOString());

    if (eventsError) {
        console.error('[lead-digest] events fetch error:', JSON.stringify(eventsError));
        return NextResponse.json({ error: 'Failed to fetch events.' }, { status: 500 });
    }

    const byProvider = new Map<string, { count: number; trades: Set<string> }>();
    for (const evt of events ?? []) {
        const pid = evt.provider_id as string;
        if (!pid) continue;
        const entry = byProvider.get(pid) ?? { count: 0, trades: new Set<string>() };
        entry.count += 1;
        if (typeof evt.diagnosis_trade === 'string' && evt.diagnosis_trade.trim()) {
            entry.trades.add(evt.diagnosis_trade.trim());
        }
        byProvider.set(pid, entry);
    }

    let sent = 0;
    let skipped = 0;
    let suppressed = 0;

    for (const [providerId, { count, trades }] of byProvider) {
        const { data: provider } = await admin
            .from('providers')
            .select('id, name, email')
            .eq('id', providerId)
            .maybeSingle();

        if (!provider?.email) {
            skipped++;
            continue;
        }

        const email = provider.email as string;
        const businessName = (provider.name as string | null) ?? 'there';

        const { data: suppression } = await admin
            .from('email_suppressions')
            .select('email')
            .eq('email', email.toLowerCase())
            .maybeSingle();

        if (suppression) {
            suppressed++;
            continue;
        }

        const { data: application } = await admin
            .from('provider_applications')
            .select('id')
            .eq('email', email.toLowerCase())
            .not('status', 'eq', 'rejected')
            .maybeSingle();

        const isRegistered = Boolean(application);
        const unsubscribeToken = buildUnsubscribeToken(email, cronSecret);
        const unsubscribeUrl = `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;

        const emailProps = {
            businessName,
            contactCount: count,
            tradeTypes: Array.from(trades),
            month: monthLabel,
            isRegistered,
            siteUrl,
            unsubscribeUrl,
        };

        if (dryRun) {
            console.warn('[lead-digest] dryRun — would send to:', JSON.stringify({ email, count, isRegistered }));
            sent++;
            continue;
        }

        const result = await sendMendrEmail({
            to: { email, name: businessName },
            subject: `${count} homeowner contact${count === 1 ? '' : 's'} — ${monthLabel} | Mendr`,
            component: React.createElement(MonthlyDigestReactEmail, emailProps),
            text: monthlyDigestReactText(emailProps),
        });

        if (!result.ok) {
            console.error('[lead-digest] send failed:', JSON.stringify({ email, error: result.error }));
            skipped++;
            continue;
        }

        const { error: updateError } = await admin
            .from('provider_contact_events')
            .update({ digest_sent_at: new Date().toISOString() })
            .eq('provider_id', providerId)
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString())
            .is('digest_sent_at', null);

        if (updateError) {
            console.error('[lead-digest] update digest_sent_at error:', JSON.stringify(updateError));
        }

        sent++;
    }

    return NextResponse.json({ sent, skipped, suppressed, dryRun, month: monthLabel });
}

export const GET = handler;
export const POST = handler;
