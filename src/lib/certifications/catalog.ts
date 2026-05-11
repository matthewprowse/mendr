/**
 * Canonical catalog of South African home-services certifications.
 *
 * The `slug` is stable and used as the primary key in `public.provider_certifications.slug`.
 * Enrichment matches free-text snippets to entries in this catalog; admin can also pick from this list.
 *
 * Keep slugs lowercase + snake_case. Add new certs at the end so existing rows stay valid.
 */

export type CertificationSlug =
    | 'ecb_registered'
    | 'master_electrician_sa'
    | 'wireman_license'
    | 'iopsa_member'
    | 'plumbing_industry_registration_board'
    | 'master_plumber_sa'
    | 'pirb_registered'
    | 'gas_practitioner_lpga'
    | 'sa_qualification_authority'
    | 'sahra_certified'
    | 'sapca_member'
    | 'sapma_member'
    | 'cidb_registered'
    | 'nhbrc_registered'
    | 'public_liability_insured';

export type CertificationEntry = {
    slug: CertificationSlug;
    /** Human-readable label, used in chips and admin pickers. */
    label: string;
    /** Short label (~3-5 chars) used on space-constrained card chips. */
    short: string;
    /** Issuing body / authority. */
    issuer: string;
    /** Trade families this cert is most relevant to (UI hint, not enforcement). */
    trades: ('electrical' | 'plumbing' | 'gas' | 'building' | 'general')[];
    /** Aliases the enrichment extractor matches against the provider scrape. */
    aliases: string[];
};

export const CERTIFICATION_CATALOG: readonly CertificationEntry[] = [
    {
        slug: 'ecb_registered',
        label: 'ECB Registered',
        short: 'ECB',
        issuer: 'Electrical Contractors Board',
        trades: ['electrical'],
        aliases: ['ecb registered', 'ecb-registered', 'ecb member', 'ecb sa'],
    },
    {
        slug: 'master_electrician_sa',
        label: 'Master Electrician (SA)',
        short: 'M.Elec',
        issuer: 'Department of Employment & Labour',
        trades: ['electrical'],
        aliases: ['master electrician', 'master installation electrician'],
    },
    {
        slug: 'wireman_license',
        label: "Wireman's Licence",
        short: 'WL',
        issuer: 'Department of Employment & Labour',
        trades: ['electrical'],
        aliases: ['wireman license', "wireman's license", 'wiremans licence'],
    },
    {
        slug: 'iopsa_member',
        label: 'IOPSA Member',
        short: 'IOPSA',
        issuer: 'Institute of Plumbing SA',
        trades: ['plumbing'],
        aliases: ['iopsa', 'iopsa registered', 'iopsa member'],
    },
    {
        slug: 'plumbing_industry_registration_board',
        label: 'PIRB Plumber',
        short: 'PIRB',
        issuer: 'Plumbing Industry Registration Board',
        trades: ['plumbing'],
        aliases: ['pirb', 'plumbing industry registration board'],
    },
    {
        slug: 'master_plumber_sa',
        label: 'Master Plumber (SA)',
        short: 'M.Plb',
        issuer: 'IOPSA',
        trades: ['plumbing'],
        aliases: ['master plumber', 'master plumber sa'],
    },
    {
        slug: 'pirb_registered',
        label: 'PIRB Registered',
        short: 'PIRB',
        issuer: 'Plumbing Industry Registration Board',
        trades: ['plumbing'],
        aliases: ['pirb registered'],
    },
    {
        slug: 'gas_practitioner_lpga',
        label: 'Authorised Gas Practitioner',
        short: 'AGP',
        issuer: 'LPGA / Department of Employment & Labour',
        trades: ['gas', 'plumbing'],
        aliases: ['gas practitioner', 'authorised gas practitioner', 'lpga registered', 'sagosa'],
    },
    {
        slug: 'sa_qualification_authority',
        label: 'SAQA Accredited',
        short: 'SAQA',
        issuer: 'South African Qualifications Authority',
        trades: ['general'],
        aliases: ['saqa accredited', 'saqa registered'],
    },
    {
        slug: 'sahra_certified',
        label: 'SAHRA Certified',
        short: 'SAHRA',
        issuer: 'South African Heritage Resources Agency',
        trades: ['building'],
        aliases: ['sahra certified', 'sahra'],
    },
    {
        slug: 'sapca_member',
        label: 'SAPCA Member',
        short: 'SAPCA',
        issuer: 'South African Painting Contractors Association',
        trades: ['general'],
        aliases: ['sapca', 'sapca member'],
    },
    {
        slug: 'sapma_member',
        label: 'SAPMA Member',
        short: 'SAPMA',
        issuer: 'South African Paint Manufacturing Association',
        trades: ['general'],
        aliases: ['sapma', 'sapma member'],
    },
    {
        slug: 'cidb_registered',
        label: 'CIDB Registered',
        short: 'CIDB',
        issuer: 'Construction Industry Development Board',
        trades: ['building'],
        aliases: ['cidb registered', 'cidb grade'],
    },
    {
        slug: 'nhbrc_registered',
        label: 'NHBRC Registered',
        short: 'NHBRC',
        issuer: 'National Home Builders Registration Council',
        trades: ['building'],
        aliases: ['nhbrc registered', 'nhbrc'],
    },
    {
        slug: 'public_liability_insured',
        label: 'Public Liability Insured',
        short: 'PL Ins',
        issuer: 'Self-declared',
        trades: ['general'],
        aliases: ['public liability', 'liability insured', 'liability insurance'],
    },
] as const;

const SLUG_INDEX: Record<string, CertificationEntry> = Object.fromEntries(
    CERTIFICATION_CATALOG.map((entry) => [entry.slug, entry])
);

export function getCertificationBySlug(slug: string): CertificationEntry | null {
    return SLUG_INDEX[slug] ?? null;
}

/**
 * Heuristic match against free-form provider text. Returns the catalog entries whose
 * slug or any alias appears in the input (case-insensitive, word-boundary safe).
 */
export function extractCertificationsFromText(text: string): CertificationEntry[] {
    const normalized = (text || '').toLowerCase();
    if (!normalized.trim()) return [];
    const seen = new Set<string>();
    const matches: CertificationEntry[] = [];
    for (const entry of CERTIFICATION_CATALOG) {
        if (seen.has(entry.slug)) continue;
        const candidates = [entry.slug.replace(/_/g, ' '), entry.label.toLowerCase(), ...entry.aliases];
        if (candidates.some((needle) => needle && normalized.includes(needle))) {
            seen.add(entry.slug);
            matches.push(entry);
        }
    }
    return matches;
}

export const CERTIFICATION_SLUGS = CERTIFICATION_CATALOG.map((c) => c.slug);
