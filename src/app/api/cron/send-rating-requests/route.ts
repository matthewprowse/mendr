/* eslint-disable no-console */
import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/auth/cron-auth';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { sendMendrEmail } from '@/lib/email';
import {
    RatingRequestEmail,
    ratingRequestText,
} from '@/lib/email/templates/rating-request';
import { getSiteUrl } from '@/lib/site-url';

// Delay between contacting a contractor and sending the rating request.
const DELAY_HOURS = 48;

async function handler(req: NextRequest): Promise<NextResponse> {
    if (!isAuthorizedCronRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true';
    const siteUrl = getSiteUrl();
    const admin = await createSupabaseAdminClient();

    const cutoff = new Date(Date.now() - DELAY_HOURS * 60 * 60 * 1000).toISOString();

    // Find contact events that are old enough and haven't had a rating email sent yet.
    const { data: events, error: eventsError } = await admin
        .from('provider_contact_events')
        .select('id, provider_id, conversation_id')
        .lte('created_at', cutoff)
        .is('rating_sent_at', null);

    if (eventsError) {
        console.error('[send-rating-requests] events fetch error:', JSON.stringify(eventsError));
        return NextResponse.json({ error: 'Failed to fetch events.' }, { status: 500 });
    }

    let sent = 0;
    let skipped = 0;

    for (const evt of events ?? []) {
        const contactEventId = evt.id as string;
        const providerId = evt.provider_id as string;
        const diagnosisId = evt.conversation_id as string;

        if (!diagnosisId) { skipped++; continue; }

        // Look up the diagnosis to find the authenticated user_id.
        const { data: diagnosis } = await admin
            .from('diagnoses')
            .select('user_id')
            .eq('id', diagnosisId)
            .maybeSingle();

        const userId = diagnosis?.user_id as string | null;
        if (!userId) { skipped++; continue; } // guest — no email available

        // Get the user's email from Supabase Auth.
        const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
        if (authErr || !authUser?.user?.email) { skipped++; continue; }
        const homeownerEmail = authUser.user.email;

        // Get provider name.
        const { data: provider } = await admin
            .from('providers')
            .select('name')
            .eq('id', providerId)
            .maybeSingle();

        const providerName = (provider?.name as string | null) ?? 'the contractor';

        // Check notification preference (opt-out).
        const { data: pref } = await admin
            .from('notification_preferences')
            .select('rating_enabled')
            .eq('user_id', userId)
            .maybeSingle();
        if (pref?.rating_enabled === false) { skipped++; continue; }

        // Check suppression list.
        const { data: suppression } = await admin
            .from('email_suppressions')
            .select('email')
            .eq('email', homeownerEmail.toLowerCase())
            .maybeSingle();

        if (suppression) { skipped++; continue; }

        // Create a one-time token.
        const { data: token, error: tokenErr } = await admin
            .from('job_outcome_tokens')
            .insert({
                contact_event_id: contactEventId,
                provider_id: providerId,
                diagnosis_id: diagnosisId,
                user_id: userId,
            })
            .select('id')
            .single();

        if (tokenErr || !token) {
            console.error('[send-rating-requests] token insert error:', JSON.stringify(tokenErr));
            skipped++;
            continue;
        }

        const ratingBaseUrl = `${siteUrl}/api/job-outcome?token=${encodeURIComponent(token.id)}&rating=`;

        const emailProps = { providerName, ratingBaseUrl };

        if (dryRun) {
            console.warn('[send-rating-requests] dryRun — would send to:', homeownerEmail);
            sent++;
            continue;
        }

        const result = await sendMendrEmail({
            to: { email: homeownerEmail },
            subject: `How did ${providerName} do? Rate your experience`,
            component: React.createElement(RatingRequestEmail, emailProps),
            text: ratingRequestText(emailProps),
        });

        if (!result.ok) {
            console.error('[send-rating-requests] send failed:', JSON.stringify({ homeownerEmail, error: result.error }));
            // Still mark as sent to avoid repeated failures for the same event.
        }

        await admin
            .from('provider_contact_events')
            .update({ rating_sent_at: new Date().toISOString() })
            .eq('id', contactEventId);

        sent++;
    }

    return NextResponse.json({ sent, skipped, dryRun });
}

export const GET = handler;
export const POST = handler;
