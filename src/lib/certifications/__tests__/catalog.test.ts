import { describe, it, expect } from 'vitest';
import {
    getCertificationBySlug,
    extractCertificationsFromText,
    CERTIFICATION_CATALOG,
} from '../catalog';

// ---------------------------------------------------------------------------
// getCertificationBySlug
// ---------------------------------------------------------------------------

describe('getCertificationBySlug', () => {
    it('returns the correct entry for a known slug', () => {
        const entry = getCertificationBySlug('ecb_registered');
        expect(entry).not.toBeNull();
        expect(entry?.label).toBe('ECB Registered');
        expect(entry?.short).toBe('ECB');
    });

    it('returns null for an unknown slug', () => {
        expect(getCertificationBySlug('not_a_slug')).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(getCertificationBySlug('')).toBeNull();
    });

    it('returns the correct entry for pirb_registered', () => {
        const entry = getCertificationBySlug('pirb_registered');
        expect(entry).not.toBeNull();
        expect(entry?.issuer).toBe('Plumbing Industry Registration Board');
    });

    it('returns the correct entry for new slugs — psira_registered', () => {
        const entry = getCertificationBySlug('psira_registered');
        expect(entry).not.toBeNull();
        expect(entry?.label).toBe('PSIRA Registered');
        expect(entry?.requires_verification).toBe(true);
    });

    it('returns the correct entry for saqcc_gas', () => {
        const entry = getCertificationBySlug('saqcc_gas');
        expect(entry).not.toBeNull();
        expect(entry?.requires_verification).toBe(true);
    });

    it('returns the correct entry for ceta_accredited', () => {
        const entry = getCertificationBySlug('ceta_accredited');
        expect(entry).not.toBeNull();
        expect(entry?.trades).toContain('building');
    });

    it('returns the correct entry for dea_waste_licence', () => {
        expect(getCertificationBySlug('dea_waste_licence')).not.toBeNull();
    });

    it('does not contain plumbing_industry_registration_board (removed duplicate)', () => {
        expect(getCertificationBySlug('plumbing_industry_registration_board')).toBeNull();
    });

    it('does not contain sapma_member (removed)', () => {
        expect(getCertificationBySlug('sapma_member')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// extractCertificationsFromText
// ---------------------------------------------------------------------------

describe('extractCertificationsFromText', () => {
    it('returns empty array for empty string', () => {
        expect(extractCertificationsFromText('')).toEqual([]);
    });

    it('returns empty array for whitespace-only string', () => {
        expect(extractCertificationsFromText('   ')).toEqual([]);
    });

    it('matches by alias (case-insensitive)', () => {
        const results = extractCertificationsFromText('We are ECB registered and fully insured');
        const slugs = results.map((r) => r.slug);
        expect(slugs).toContain('ecb_registered');
    });

    it('matches by label (case-insensitive)', () => {
        const results = extractCertificationsFromText("Our team holds a wireman's license");
        const slugs = results.map((r) => r.slug);
        expect(slugs).toContain('wireman_license');
    });

    it('deduplicates — same cert matched by multiple aliases returns once', () => {
        const results = extractCertificationsFromText('pirb registered plumbing industry registration board');
        const pirbEntries = results.filter((r) => r.slug === 'pirb_registered');
        expect(pirbEntries.length).toBe(1);
    });

    it('matches multiple certs in one block of text', () => {
        const results = extractCertificationsFromText(
            'CIDB registered, NHBRC registered, and public liability insured'
        );
        const slugs = results.map((r) => r.slug);
        expect(slugs).toContain('cidb_registered');
        expect(slugs).toContain('nhbrc_registered');
        expect(slugs).toContain('public_liability_insured');
    });

    it('matches new slug psira via alias', () => {
        const results = extractCertificationsFromText('psira registration number 123456');
        const slugs = results.map((r) => r.slug);
        expect(slugs).toContain('psira_registered');
    });

    it('matches saiw_certified via alias', () => {
        const results = extractCertificationsFromText('SAIW certified welder on staff');
        const slugs = results.map((r) => r.slug);
        expect(slugs).toContain('saiw_certified');
    });

    it('matches locsa_member via alias', () => {
        const results = extractCertificationsFromText('locksmith association of south africa member');
        const slugs = results.map((r) => r.slug);
        expect(slugs).toContain('locsa_member');
    });

    it('matches nspi_member via alias', () => {
        const results = extractCertificationsFromText('national spa and pool institute member');
        const slugs = results.map((r) => r.slug);
        expect(slugs).toContain('nspi_member');
    });

    it('matches ceta_accredited via alias', () => {
        const results = extractCertificationsFromText('CETA accredited training provider');
        const slugs = results.map((r) => r.slug);
        expect(slugs).toContain('ceta_accredited');
    });

    it('does not match sapma (removed from catalog)', () => {
        const results = extractCertificationsFromText('SAPMA member for paint manufacturing');
        const slugs = results.map((r) => r.slug);
        expect(slugs).not.toContain('sapma_member');
    });
});

// ---------------------------------------------------------------------------
// CERTIFICATION_CATALOG integrity
// ---------------------------------------------------------------------------

describe('CERTIFICATION_CATALOG', () => {
    it('has no duplicate slugs', () => {
        const slugs = CERTIFICATION_CATALOG.map((c) => c.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
    });

    it('all entries have requires_verification boolean', () => {
        for (const entry of CERTIFICATION_CATALOG) {
            expect(typeof entry.requires_verification).toBe('boolean');
        }
    });

    it('does not contain plumbing_industry_registration_board', () => {
        const slugs = CERTIFICATION_CATALOG.map((c) => c.slug);
        expect(slugs).not.toContain('plumbing_industry_registration_board');
    });

    it('does not contain sapma_member', () => {
        const slugs = CERTIFICATION_CATALOG.map((c) => c.slug);
        expect(slugs).not.toContain('sapma_member');
    });

    it('ecb_registered has requires_verification true', () => {
        const ecb = CERTIFICATION_CATALOG.find((c) => c.slug === 'ecb_registered');
        expect(ecb?.requires_verification).toBe(true);
    });

    it('wireman_license has requires_verification true', () => {
        const wl = CERTIFICATION_CATALOG.find((c) => c.slug === 'wireman_license');
        expect(wl?.requires_verification).toBe(true);
    });

    it('pirb_registered includes updated aliases', () => {
        const pirb = CERTIFICATION_CATALOG.find((c) => c.slug === 'pirb_registered');
        expect(pirb?.aliases).toContain('plumbing industry registration board');
        expect(pirb?.aliases).toContain('pirb plumber');
    });
});
