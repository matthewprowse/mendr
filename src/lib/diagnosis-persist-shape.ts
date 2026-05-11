/**
 * Shapes for `diagnoses.diagnosis` JSONB that satisfy
 * `diagnoses_diagnosis_shape_check` (trade, urgency_key, confidence required).
 */

export type PersistableDiagnosisPatch = Record<string, unknown>;

/** Early row from /start or /welcome when user picked a service hint only. */
export function bootstrapDiagnosisFromServiceHint(trade: string): PersistableDiagnosisPatch {
    const t = trade.trim();
    return {
        trade: t,
        urgency_key: 'soon',
        confidence: 0,
        selected_trade_hint: t,
        diagnosis: `${t} services`,
        thinking: '',
        action_required: 'N/A',
        estimated_cost: '',
    };
}

/** Mid-flight save after image-thought-only phase (before full JSON exists). */
export function interimThoughtDiagnosis(thought: string, serviceHint: string | null): PersistableDiagnosisPatch {
    const trade =
        typeof serviceHint === 'string' && serviceHint.trim() ? serviceHint.trim() : 'N/A';
    return {
        trade,
        urgency_key: 'soon',
        confidence: 0,
        thinking: thought,
        diagnosis: 'Diagnosing…',
        action_required: 'N/A',
        estimated_cost: '',
        ...(typeof serviceHint === 'string' && serviceHint.trim()
            ? { selected_trade_hint: serviceHint.trim() }
            : {}),
    };
}
