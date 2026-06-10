export const BRAND_NAME = 'Mendr' as const;
export const BRAND_NAME_PRO = 'Mendr Pro' as const;

export const BRAND_TAGLINE = 'Clarity first home diagnostics' as const;

/**
 * Customer-facing term for a service professional.
 *
 * Per the provider-naming decision the database and code keep "provider"; only
 * labels shown to customers say "Pro" (the brand is "Mendr Pro"). Route all
 * customer-facing provider copy through here so the wording stays consistent and
 * is trivial to revisit in one place.
 */
export const PRO_TERM = {
    one: 'Pro',
    many: 'Pros',
} as const;

/** Count plus the correctly pluralised Pro label, e.g. `proCount(3)` returns "3 Pros". */
export function proCount(n: number): string {
    return `${n} ${n === 1 ? PRO_TERM.one : PRO_TERM.many}`;
}

export const mendrCopyGuidelines = {
    voice: [
        'Warm, calm, and practical',
        'Write like you are helping a neighbour',
        'Use plain language and prioritise reassurance over hype',
    ],
    headlineFormula: 'What is happening + what to do next + calm reassurance',
    ctaRules: [
        'Use action verbs: Start, Review, Compare, Contact',
        'Avoid pressure language such as "urgent" unless safety critical',
        'Keep CTAs under five words where possible',
    ],
    bannedPhrases: [
        'Guaranteed fix',
        'Instant repair',
        'Perfect match',
    ],
} as const;
