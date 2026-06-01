/**
 * Phase 2 of `docs/Diagnosis-Architecture-Hardening-Plan.md` — fire-and-forget
 * persistence wrapper for Agent 3 (self-critique).
 *
 * Writes the critique JSON to `diagnoses.diagnosis_critique` for the given
 * diagnosis row. Never throws — on error or missing input, logs a structured
 * `console.warn` and returns. This is called from `/api/diagnose` and
 * `/api/diagnoses/[id]/refine` as a fire-and-forget tail; nothing about the
 * user-facing response depends on this completing.
 *
 * The heavy-lifting (admin client, retry semantics, first-write-wins) lives
 * in `persistCritique` inside `agent-critique.ts` because it has to share the
 * column shape with the runner. This module is a deliberately thin shim so
 * callers depend on `@/lib/diagnosis/persist-critique` per the Phase 2 file
 * layout, without each caller importing from the agent module directly.
 */

import type { DiagnosisCritique } from '@/features/diagnosis/types';
import { persistCritique as persistCritiqueImpl } from '@/features/diagnosis/agent-critique';

/**
 * Persist the critique to `diagnoses.diagnosis_critique`. Never throws.
 *
 * - When `critique` is null (critique skipped or failed), no-ops.
 * - When `conversationId` is missing (e.g. `/api/diagnose` initial call —
 *   the diagnoses row is created client-side via PATCH after the response),
 *   no-ops and logs a structured debug line. Phase 8's cron will backfill.
 */
export async function persistCritique(
    conversationId: string | null | undefined,
    critique: DiagnosisCritique | null,
): Promise<void> {
    if (critique === null) return;

    const id = typeof conversationId === 'string' ? conversationId.trim() : '';
    if (id.length === 0) {
        console.warn(
            JSON.stringify({
                type: 'agent-critique:persist-skipped',
                reason: 'missing_conversation_id',
            }),
        );
        return;
    }

    try {
        await persistCritiqueImpl(id, critique);
    } catch (e) {
        console.warn(
            JSON.stringify({
                type: 'agent-critique:persist-failed',
                conversationId: id,
                err: e instanceof Error ? e.message : String(e),
            }),
        );
    }
}
