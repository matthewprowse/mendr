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
    | 'master_plumber_sa'
    | 'pirb_registered'
    | 'gas_practitioner_lpga'
    | 'sa_qualification_authority'
    | 'sahra_certified'
    | 'sapca_member'
    | 'cidb_registered'
    | 'nhbrc_registered'
    | 'public_liability_insured'
    | 'psira_registered'
    | 'saidsa_member'
    | 'locsa_member'
    | 'saiw_certified'
    | 'saqcc_gas'
    | 'nspi_member'
    | 'dea_waste_licence'
    | 'ceta_accredited';

export type CertificationEntry = {
    slug: CertificationSlug;
    /** Human-readable label, used in chips and admin pickers. */
    label: string;
    /** Short label (~3-5 chars) used on space-constrained card chips. */
    short: string;
    /** Issuing body / authority. */
    issuer: string;
    /** Trade families this cert is most relevant to (UI hint, not enforcement). */
    trades: ('electrical' | 'plumbing' | 'gas' | 'building' | 'general' | 'security' | 'locksmith' | 'welding' | 'pool')[];
    /** Whether a verification check with the issuing body is supported. */
    requires_verification: boolean;
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
        requires_verification: true,
        aliases: ['ecb registered', 'ecb-registered', 'ecb member', 'ecb sa'],
    },
    {
        slug: 'master_electrician_sa',
        label: 'Master Electrician (SA)',
        short: 'M.Elec',
        issuer: 'Department of Employment & Labour',
        trades: ['electrical'],
        requires_verification: false,
        aliases: ['master electrician', 'master installation electrician'],
    },
    {
        slug: 'wireman_license',
        label: "Wireman's Licence",
        short: 'WL',
        issuer: 'Department of Employment & Labour',
        trades: ['electrical'],
        requires_verification: true,
        aliases: ['wireman license', "wireman's license", 'wiremans licence'],
    },
    {
        slug: 'iopsa_member',
        label: 'IOPSA Member',
        short: 'IOPSA',
        issuer: 'Institute of Plumbing SA',
        trades: ['plumbing'],
        requires_verification: false,
        aliases: ['iopsa', 'iopsa registered', 'iopsa member'],
    },
    {
        slug: 'master_plumber_sa',
        label: 'Master Plumber (SA)',
        short: 'M.Plb',
        issuer: 'IOPSA',
        trades: ['plumbing'],
        requires_verification: true,
        aliases: ['master plumber', 'master plumber sa'],
    },
    {
        slug: 'pirb_registered',
        label: 'PIRB Registered',
        short: 'PIRB',
        issuer: 'Plumbing Industry Registration Board',
        trades: ['plumbing'],
        requires_verification: true,
        aliases: ['pirb', 'pirb registered', 'plumbing industry registration board', 'pirb plumber'],
    },
    {
        slug: 'gas_practitioner_lpga',
        label: 'Authorised Gas Practitioner',
        short: 'AGP',
        issuer: 'LPGA / Department of Employment & Labour',
        trades: ['gas', 'plumbing'],
        requires_verification: true,
        aliases: ['gas practitioner', 'authorised gas practitioner', 'lpga registered', 'sagosa'],
    },
    {
        slug: 'sa_qualification_authority',
        label: 'SAQA Accredited',
        short: 'SAQA',
        issuer: 'South African Qualifications Authority',
        trades: ['general'],
        requires_verification: false,
        aliases: ['saqa accredited', 'saqa registered'],
    },
    {
        slug: 'sahra_certified',
        label: 'SAHRA Certified',
        short: 'SAHRA',
        issuer: 'South African Heritage Resources Agency',
        trades: ['building'],
        requires_verification: false,
        aliases: ['sahra certified', 'sahra'],
    },
    {
        slug: 'sapca_member',
        label: 'SAPCA Member',
        short: 'SAPCA',
        issuer: 'South African Painting Contractors Association',
        trades: ['general'],
        requires_verification: false,
        aliases: ['sapca', 'sapca member'],
    },
    {
        slug: 'cidb_registered',
        label: 'CIDB Registered',
        short: 'CIDB',
        issuer: 'Construction Industry Development Board',
        trades: ['building'],
        requires_verification: false,
        aliases: ['cidb registered', 'cidb grade'],
    },
    {
        slug: 'nhbrc_registered',
        label: 'NHBRC Registered',
        short: 'NHBRC',
        issuer: 'National Home Builders Registration Council',
        trades: ['building'],
        requires_verification: false,
        aliases: ['nhbrc registered', 'nhbrc'],
    },
    {
        slug: 'public_liability_insured',
        label: 'Public Liability Insured',
        short: 'PL Ins',
        issuer: 'Self-declared',
        trades: ['general'],
        requires_verification: false,
        aliases: ['public liability', 'liability insured', 'liability insurance'],
    },
    {
        slug: 'psira_registered',
        label: 'PSIRA Registered',
        short: 'PSIRA',
        issuer: 'Private Security Industry Regulatory Authority',
        trades: ['general'],
        requires_verification: true,
        aliases: ['psira', 'psira registered', 'psira registration', 'psia registered'],
    },
    {
        slug: 'saidsa_member',
        label: 'SAIDSA Member',
        short: 'SAIDSA',
        issuer: 'South African Intruder Detection Services Association',
        trades: ['general'],
        requires_verification: false,
        aliases: ['saidsa', 'saidsa member', 'saidsa registered'],
    },
    {
        slug: 'locsa_member',
        label: 'LOCSA Member',
        short: 'LOCSA',
        issuer: 'Locksmith Association of South Africa',
        trades: ['general'],
        requires_verification: false,
        aliases: ['locsa', 'locsa member', 'locksmith association of south africa'],
    },
    {
        slug: 'saiw_certified',
        label: 'SAIW Certified Welder',
        short: 'SAIW',
        issuer: 'South African Institute of Welding',
        trades: ['general'],
        requires_verification: false,
        aliases: ['saiw', 'saiw certified', 'south african institute of welding'],
    },
    {
        slug: 'saqcc_gas',
        label: 'SAQCC-GAS Registered',
        short: 'SAQCC',
        issuer: 'SA Qualifications Certification Committee for Gas',
        trades: ['gas', 'general'],
        requires_verification: true,
        aliases: ['saqcc', 'saqcc gas', 'saqcc-gas', 'saqcc registered'],
    },
    {
        slug: 'nspi_member',
        label: 'NSPI Member',
        short: 'NSPI',
        issuer: 'National Spa and Pool Institute of SA',
        trades: ['general'],
        requires_verification: false,
        aliases: ['nspi', 'nspi member', 'national spa and pool institute'],
    },
    {
        slug: 'dea_waste_licence',
        label: 'DEA Waste Management Licence',
        short: 'DEA',
        issuer: 'Department of Environment, Forestry and Fisheries',
        trades: ['general'],
        requires_verification: false,
        aliases: ['dea waste', 'waste management licence', 'waste management license', 'dea licensed'],
    },
    {
        slug: 'ceta_accredited',
        label: 'CETA Accredited',
        short: 'CETA',
        issuer: 'Construction Education and Training Authority',
        trades: ['building', 'general'],
        requires_verification: false,
        aliases: ['ceta', 'ceta accredited', 'ceta registered', 'construction education training authority'],
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
