/* eslint-disable no-console */
/**
 * WhatsApp housekeeping cron (Phase C, Workstreams 5/9 + plan improvement 7).
 *
 * Authenticated with CRON_SECRET (Authorization: Bearer <secret>). Intended
 * cadence: hourly. Three jobs:
 *   1. Send due follow-ups from `whatsapp_followups` (job_followup templates,
 *      scheduled when a contact is initiated).
 *   2. Send resume nudges (resume_diagnosis template) for sessions stuck
 *      mid-flow 24–72h idle — outside the free-form window, hence template.
 *   3. Delete sessions idle > 30 days.
 *
 * All proactive sends go through the outbox, which suppresses opted-out
 * numbers and dead-letters exhausted failures.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { sendOutbound } from '@/lib/whatsapp/outbox';
import { jobFollowupTemplate, resumeDiagnosisTemplate } from '@/lib/whatsapp/templates';

const SESSION_MAX_IDLE_DAYS = 30;
const RESUME_MIN_IDLE_MS = 24 * 60 * 60 * 1000;
const RESUME_MAX_IDLE_MS = 72 * 60 * 60 * 1000;
const BATCH = 50;

export async function GET(req: NextRequest) {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get('authorization');
    if (!secret || auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = await createSupabaseAdminClient();
    const summary = { followupsSent: 0, resumesSent: 0, sessionsDeleted: 0, errors: 0 };

    // ── 1. Due follow-ups ────────────────────────────────────────────────────
    try {
        const { data: due } = await admin
            .from('whatsapp_followups')
            .select('id, phone_number, kind, payload')
            .is('sent_at', null)
            .lte('due_at', new Date().toISOString())
            .limit(BATCH);
        for (const row of due ?? []) {
            const payload = (row.payload ?? {}) as {
                provider_name?: string;
                issue_title?: string;
            };
            if (row.kind !== 'job_followup') continue;
            const res = await sendOutbound({
                to: row.phone_number,
                kind: 'proactive',
                template: jobFollowupTemplate(
                    payload.provider_name ?? '',
                    payload.issue_title ?? '',
                ),
            });
            await admin
                .from('whatsapp_followups')
                .update({
                    sent_at: new Date().toISOString(),
                    send_ok: res.ok,
                })
                .eq('id', row.id);
            if (res.ok) summary.followupsSent++;
            else summary.errors++;
        }
    } catch (e) {
        console.error('[cron/whatsapp] followups failed', e);
        summary.errors++;
    }

    // ── 2. Resume nudges ─────────────────────────────────────────────────────
    try {
        const now = Date.now();
        const min = new Date(now - RESUME_MAX_IDLE_MS).toISOString();
        const max = new Date(now - RESUME_MIN_IDLE_MS).toISOString();
        const { data: stale } = await admin
            .from('whatsapp_sessions')
            .select('phone_number, state, active_diagnosis_id, resume_prompted_at')
            .gte('last_message_at', min)
            .lte('last_message_at', max)
            .neq('state', 'idle')
            .neq('state', 'contact_initiated')
            .is('resume_prompted_at', null)
            .not('active_diagnosis_id', 'is', null)
            .not('user_id', 'is', null)
            .limit(BATCH);
        for (const row of stale ?? []) {
            const { data: diag } = await admin
                .from('diagnoses')
                .select('diagnosis_data')
                .eq('id', row.active_diagnosis_id)
                .maybeSingle();
            const title =
                (diag?.diagnosis_data as { diagnosis?: string } | null)?.diagnosis ?? '';
            const res = await sendOutbound({
                to: row.phone_number,
                kind: 'proactive',
                template: resumeDiagnosisTemplate(title),
            });
            await admin
                .from('whatsapp_sessions')
                .update({ resume_prompted_at: new Date().toISOString() })
                .eq('phone_number', row.phone_number);
            if (res.ok) summary.resumesSent++;
            else summary.errors++;
        }
    } catch (e) {
        console.error('[cron/whatsapp] resume nudges failed', e);
        summary.errors++;
    }

    // ── 3. Session hygiene ───────────────────────────────────────────────────
    try {
        const cutoff = new Date(
            Date.now() - SESSION_MAX_IDLE_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString();
        const { data: deleted } = await admin
            .from('whatsapp_sessions')
            .delete()
            .lt('last_message_at', cutoff)
            .select('id');
        summary.sessionsDeleted = deleted?.length ?? 0;
    } catch (e) {
        console.error('[cron/whatsapp] session cleanup failed', e);
        summary.errors++;
    }

    return NextResponse.json(summary);
}
