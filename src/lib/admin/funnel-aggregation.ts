/**
 * Pure aggregation helper for the admin onboarding funnel.
 *
 * Stages, in order:
 *   welcome_start      → "Welcome start"
 *   diagnosis_complete → "Diagnosis complete"
 *   match_view         → "Match view"
 *   provider_contact   → "Provider contact"
 *
 * Each stage's count is the number of DISTINCT session_ids that emitted at
 * least one event of that type. `conversionFromPrior` is the percentage of
 * sessions at this stage relative to the previous stage. The first stage has
 * `conversionFromPrior: null` (no prior stage to compare against).
 *
 * Unknown event_types are silently ignored — they neither contribute to any
 * stage nor cause an error. Empty input yields four stages of count 0, with
 * `conversionFromPrior` null for every stage (cannot compute a ratio from 0).
 */

export type FunnelStageRaw = {
    event_type: string;
    session_id: string;
};

export type FunnelStage = {
    key: string;
    label: string;
    count: number;
    conversionFromPrior: number | null;
};

export const FUNNEL_STAGE_DEFS: ReadonlyArray<{ key: string; label: string }> = [
    { key: 'welcome_start',      label: 'Welcome start' },
    { key: 'diagnosis_complete', label: 'Diagnosis complete' },
    { key: 'match_view',         label: 'Match view' },
    { key: 'provider_contact',   label: 'Provider contact' },
] as const;

export function computeFunnelStages(
    rows: FunnelStageRaw[],
): { stages: FunnelStage[]; totalSessions: number } {
    // Distinct session_ids per stage.
    const sessionsByStage: Record<string, Set<string>> = {};
    for (const def of FUNNEL_STAGE_DEFS) {
        sessionsByStage[def.key] = new Set<string>();
    }

    // Track every distinct session_id we've seen across any stage.
    const allSessions = new Set<string>();

    for (const row of rows) {
        if (!row || typeof row.session_id !== 'string' || !row.session_id) continue;
        const bucket = sessionsByStage[row.event_type];
        if (!bucket) continue; // unknown event_type — silently ignore
        bucket.add(row.session_id);
        allSessions.add(row.session_id);
    }

    const stages: FunnelStage[] = FUNNEL_STAGE_DEFS.map((def, index) => {
        const count = sessionsByStage[def.key].size;
        let conversionFromPrior: number | null = null;
        if (index > 0) {
            const priorCount = sessionsByStage[FUNNEL_STAGE_DEFS[index - 1].key].size;
            conversionFromPrior = priorCount > 0 ? (count / priorCount) * 100 : null;
        }
        return {
            key: def.key,
            label: def.label,
            count,
            conversionFromPrior,
        };
    });

    return { stages, totalSessions: allSessions.size };
}
