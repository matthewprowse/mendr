export const BRAND_NAME = 'Mendr' as const;
export const BRAND_LEGACY_NAME = 'Scandio' as const;

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

export type MigrationSurface = {
    label: string;
    examples: string[];
    status: 'safe_now' | 'migration_later';
    reason: string;
};

export const mendrMigrationSurfaces: MigrationSurface[] = [
    {
        label: 'User-facing copy and labels',
        examples: ['Landing headers', 'Page titles', 'CTA text'],
        status: 'safe_now',
        reason: 'Pure presentation changes with no data compatibility risk.',
    },
    {
        label: 'SEO metadata and schema display names',
        examples: ['OpenGraph siteName', 'JSON-LD Organization.name'],
        status: 'safe_now',
        reason: 'Safe if brand naming updates are consistent and intentional.',
    },
    {
        label: 'Preview/design assets',
        examples: ['New Mendr OG image references', 'Design route components'],
        status: 'safe_now',
        reason: 'Isolated from runtime data behavior.',
    },
    {
        label: 'Browser storage keys',
        examples: ['scandio_session_id', 'scandio_my_reports'],
        status: 'migration_later',
        reason: 'Requires compatibility migration to preserve existing sessions.',
    },
    {
        label: 'Analytics event names and types',
        examples: ['logScandioEvent', 'ScandioEvent'],
        status: 'migration_later',
        reason: 'Renaming can break dashboards and historical trend continuity.',
    },
    {
        label: 'Data-source literals and bot identity',
        examples: ["source = 'scandio'", 'ScandioBot user-agent'],
        status: 'migration_later',
        reason: 'Values may be persisted or consumed by backend workflows.',
    },
    {
        label: 'Domain and environment defaults',
        examples: ['scandio.co.za', 'app.scandio.co.za'],
        status: 'migration_later',
        reason: 'Needs coordinated DNS, redirects, and canonical strategy.',
    },
];
