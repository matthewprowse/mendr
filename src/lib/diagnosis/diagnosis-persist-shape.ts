/**
 * Shapes for `diagnoses.diagnosis` JSONB that satisfy
 * `diagnoses_diagnosis_shape_check` (trade and confidence required).
 */

export type PersistableDiagnosisPatch = Record<string, unknown>;

/** Early row from /start or /welcome when user picked a service hint only. */
export function bootstrapDiagnosisFromServiceHint(trade: string): PersistableDiagnosisPatch {
    const t = trade.trim();
    return {
        trade: t,
        confidence: 0,
        selected_trade_hint: t,
        diagnosis: `${t} services`,
        thinking: '',
        action_required: 'N/A',
    };
}

/** Mid-flight save after image-thought-only phase (before full JSON exists). */
export function interimThoughtDiagnosis(thought: string, serviceHint: string | null): PersistableDiagnosisPatch {
    const trade =
        typeof serviceHint === 'string' && serviceHint.trim() ? serviceHint.trim() : 'N/A';
    return {
        trade,
        confidence: 0,
        thinking: thought,
        diagnosis: 'Diagnosing…',
        action_required: 'N/A',
        ...(typeof serviceHint === 'string' && serviceHint.trim()
            ? { selected_trade_hint: serviceHint.trim() }
            : {}),
    };
}
