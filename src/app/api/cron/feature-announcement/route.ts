/* eslint-disable no-console */
/**
 * Cron: feature announcement ("What's new") emails.
 *
 * Sends the most recent published, not-yet-emailed feature_announcements row to
 * every account that hasn't opted out of product updates. One template renders
 * any announcement, so shipping a feature needs no new email code — just a row
 * (e.g. authored via the Supabase MCP). Idempotent: once an announcement's
 * email_sent_at is set it is never re-sent.
 *
 * Supports ?dryRun=true to count recipients without sending.
 */

import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { isAuthorizedCronRequest } from '@/lib/auth/cron-auth';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import {
    FeatureAnnouncementEmail,
    featureAnnouncementText,
} from '@/lib/email/templates/feature-announcement';
import { sendMendrEmail, generateUnsubscribeUrl } from '@/lib/email';
import { getSiteUrl } from '@/lib/site-url';

async function handler(req: NextRequest): Promise<NextResponse> {
    if (!isAuthorizedCronRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true';
    const siteUrl = getSiteUrl();
    const admin = await createSupabaseAdminClient();

    // 1. The next announcement to email: published, not yet sent.
    const { data: announcement, error: fetchError } = await admin
        .from('feature_announcements')
        .select('id, slug, title, summary')
        .not('published_at', 'is', null)
        .lte('published_at', new Date().toISOString())
        .is('email_sent_at', null)
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (fetchError) {
        console.error('[feature-announcement] fetch error:', JSON.stringify(fetchError));
        return NextResponse.json({ error: 'Failed to fetch announcement.' }, { status: 500 });
    }
    if (!announcement) {
        return NextResponse.json({ sent: 0, reason: 'No pending announcement.' });
    }

    const url = `${siteUrl}/new/${announcement.slug}`;
    const summary = (announcement.summary as string | null)?.trim() || announcement.title;

    // 2. Opt-outs and suppressions.
    const [{ data: optOutRows }, { data: suppressionRows }] = await Promise.all([
        admin.from('notification_preferences').select('user_id').eq('product_updates_enabled', false),
        admin.from('email_suppressions').select('email'),
    ]);
    const optedOut = new Set((optOutRows ?? []).map((r) => r.user_id as string));
    const suppressed = new Set(
        (suppressionRows ?? []).map((r) => (r.email as string).toLowerCase().trim()),
    );

    // 3. Iterate all accounts (paginated) and send to those still opted in.
    let sent = 0;
    let skipped = 0;
    const perPage = 1000;

    for (let page = 1; ; page++) {
        const { data: usersPage, error: listError } = await admin.auth.admin.listUsers({ page, perPage });
        if (listError) {
            console.error('[feature-announcement] listUsers error:', JSON.stringify(listError));
            break;
        }
        const users = usersPage?.users ?? [];
        if (users.length === 0) break;

        for (const user of users) {
            const email = user.email?.toLowerCase().trim();
            if (!email || optedOut.has(user.id) || suppressed.has(email)) {
                skipped++;
                continue;
            }
            if (dryRun) {
                sent++;
                continue;
            }

            const unsubscribeUrl = generateUnsubscribeUrl(email);
            const props = { title: announcement.title, summary, url, unsubscribeUrl };
            const result = await sendMendrEmail({
                to: { email },
                subject: `What's new on Mendr: ${announcement.title}`,
                component: React.createElement(FeatureAnnouncementEmail, props),
                text: featureAnnouncementText(props),
                tags: ['feature-announcement'],
            });

            if (result.ok) {
                sent++;
            } else {
                skipped++;
                console.error('[feature-announcement] send failed:', JSON.stringify({ email, error: result.error }));
            }
        }

        if (users.length < perPage) break;
    }

    // 4. Mark as emailed so it never re-sends (skip on dry run).
    if (!dryRun) {
        const { error: updateError } = await admin
            .from('feature_announcements')
            .update({ email_sent_at: new Date().toISOString() })
            .eq('id', announcement.id);
        if (updateError) {
            console.error('[feature-announcement] mark email_sent_at error:', JSON.stringify(updateError));
        }
    }

    return NextResponse.json({ announcement: announcement.slug, sent, skipped, dryRun });
}

export const GET = handler;
export const POST = handler;
