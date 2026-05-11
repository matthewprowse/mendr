/**
 * Shared formatting for diagnosis copy on the report and diagnosis flows.
 */

export function cleanThoughtSentenceStarts(text: string): string {
    const fillers = /^[("'`\s-]*(a|an|the|this|it|there)\b[\s,:-]*/i;
    return text
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
            const cleaned = s.replace(fillers, '').trim();
            if (!cleaned) return s;
            const normalizedVoice = cleaned
                .replace(/\bthe user\b/gi, 'you')
                .replace(/\buser\b/gi, 'you')
                .replace(/\bhomeowner\b/gi, 'you');
            return normalizedVoice.charAt(0).toUpperCase() + normalizedVoice.slice(1);
        })
        .join(' ')
        .trim();
}

export function splitDetailAndHazard(text: string): { detail: string; hazard: string } {
    const raw = (text || '').trim();
    if (!raw) return { detail: '', hazard: '' };

    const sentences = raw
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

    const hazardPattern =
        /\b(avoid|do not|don't|dont|never|risk|danger|unsafe|shock|fire|flood|leak|gas|switch off|turn off|isolate|unplug|stop using)\b/i;

    const hazardSentences = sentences.filter((s) => hazardPattern.test(s));
    if (hazardSentences.length === 0) {
        return { detail: raw, hazard: '' };
    }

    const hazardSet = new Set(hazardSentences);
    const detailSentences = sentences.filter((s) => !hazardSet.has(s));
    return {
        detail: detailSentences.join(' ').trim(),
        hazard: hazardSentences.slice(0, 3).join(' ').trim(),
    };
}

function normalizeForCompare(s: string): string {
    return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Derive "what the model noticed" for display below the photo (matches diagnosis page logic). */
export function reportThoughtsParagraph(
    diagnosis: Record<string, unknown> | null,
    initialImageDescription: string | null | undefined
): string {
    if (!diagnosis) {
        const onlyInitial = (initialImageDescription ?? '').trim();
        return onlyInitial ? cleanThoughtSentenceStarts(onlyInitial) : '';
    }
    const thinking = typeof (diagnosis as { thinking?: unknown }).thinking === 'string'
        ? (diagnosis as { thinking: string }).thinking.trim()
        : '';
    const imgDesc =
        Array.isArray((diagnosis as { image_descriptions?: unknown }).image_descriptions) &&
        typeof (diagnosis as { image_descriptions: string[] }).image_descriptions[0] === 'string'
            ? String((diagnosis as { image_descriptions: string[] }).image_descriptions[0]).trim()
            : '';
    const initial = (initialImageDescription ?? '').trim();
    const raw = thinking || imgDesc || initial;
    return raw ? cleanThoughtSentenceStarts(raw) : '';
}

export function diagnosisSectionsDuplicate(
    messageRaw: string | null | undefined,
    actionRaw: string | null | undefined
): boolean {
    const m = normalizeForCompare(messageRaw ?? '');
    const a = normalizeForCompare(actionRaw ?? '');
    if (!m || !a) return false;
    return m === a;
}

const COST_PLACEHOLDER = /^n\/a$/i;

function meaningfulCostField(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const t = value.trim();
    return t.length > 0 && !COST_PLACEHOLDER.test(t);
}

/** True when the summary cost line is safe to show in the Beta UI. */
export function hasRenderableBetaCostEstimate(
    diagnosis: Record<string, unknown> | null | undefined
): boolean {
    if (!diagnosis) return false;
    return meaningfulCostField(diagnosis.estimated_cost);
}

export type BetaCostEstimateRow = { label: string; value: string };

/** Single lead paragraph for the Beta cost card (`estimated_cost` only). */
export function getBetaCostEstimateRows(
    diagnosis: Record<string, unknown> | null | undefined
): BetaCostEstimateRow[] {
    if (!diagnosis) return [];
    if (!meaningfulCostField(diagnosis.estimated_cost)) return [];
    return [{ label: '', value: diagnosis.estimated_cost.trim() }];
}
