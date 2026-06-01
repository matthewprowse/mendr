/**
 * Durable per-diagnosis funnel stamps (Phase 2 of the analytics rebuild).
 *
 * Replaces the fragile client-side `diagnosis_events` funnel — which stopped
 * producing rows on 2026-04-26 and never recorded the entry or completion
 * stages — with durable, server-written state in `diagnosis_funnel`, keyed by
 * diagnosis_id (one fault equals one diagnosis equals one journey).
 *
 * Every stamp is "first write wins": repeated calls never overwrite an earlier
 * timestamp (enforced with `.is(column, null)`). Each function is best-effort
 * and never throws into the caller path, mirroring analytics and AI-cost logging.
 */

import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FunnelStage = 'delivered' | 'matches_shown' | 'first_contact';

type AdminClient = Awaited<ReturnType<typeof createSupabaseAdminClient>>;

function logFunnelError(stage: FunnelStage, diagnosisId: string, error: unknown): void {
    console.warn(
        JSON.stringify({
            type: 'funnel_stamp_error',
            stage,
            diagnosisId,
            error: error instanceof Error ? error.message : String(error),
        }),
    );
}

/** Ensure a funnel row exists for this diagnosis without clobbering existing stamps. */
async function ensureFunnelRow(admin: AdminClient, diagnosisId: string): Promise<void> {
    await admin
        .from('diagnosis_funnel')
        .upsert({ diagnosis_id: diagnosisId }, { onConflict: 'diagnosis_id', ignoreDuplicates: true });
}

/** Stage 2 — stamp the moment the AI diagnosis was first delivered. First write wins. */
export async function stampDiagnosisDelivered(diagnosisId: string): Promise<void> {
    if (!UUID_RE.test(diagnosisId)) return;
    try {
        const admin = await createSupabaseAdminClient();
        const now = new Date().toISOString();
        await ensureFunnelRow(admin, diagnosisId);
        await admin
            .from('diagnosis_funnel')
            .update({ delivered_at: now, updated_at: now })
            .eq('diagnosis_id', diagnosisId)
            .is('delivered_at', null);
    } catch (error) {
        logFunnelError('delivered', diagnosisId, error);
    }
}

/** Stage 3 — stamp the moment provider matches were first shown, with how many. First write wins. */
export async function stampMatchesShown(diagnosisId: string, matchCount: number): Promise<void> {
    if (!UUID_RE.test(diagnosisId)) return;
    const count = Number.isFinite(matchCount) && matchCount > 0 ? Math.trunc(matchCount) : 0;
    try {
        const admin = await createSupabaseAdminClient();
        const now = new Date().toISOString();
        await ensureFunnelRow(admin, diagnosisId);
        await admin
            .from('diagnosis_funnel')
            .update({ matches_shown_at: now, match_count: count, updated_at: now })
            .eq('diagnosis_id', diagnosisId)
            .is('matches_shown_at', null);
    } catch (error) {
        logFunnelError('matches_shown', diagnosisId, error);
    }
}

/** Stage 4 — stamp the moment the homeowner first contacted a contractor. First write wins. */
export async function stampFirstContact(diagnosisId: string): Promise<void> {
    if (!UUID_RE.test(diagnosisId)) return;
    try {
        const admin = await createSupabaseAdminClient();
        const now = new Date().toISOString();
        await ensureFunnelRow(admin, diagnosisId);
        await admin
            .from('diagnosis_funnel')
            .update({ first_contact_at: now, updated_at: now })
            .eq('diagnosis_id', diagnosisId)
            .is('first_contact_at', null);
    } catch (error) {
        logFunnelError('first_contact', diagnosisId, error);
    }
}
