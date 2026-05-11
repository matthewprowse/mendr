/**
 * Central metadata registry for all Menda pages.
 *
 * Convention
 * ──────────
 * - Titles: sentence case, no trailing "| Menda" — the root layout template
 *   appends that automatically via `title: { template: '%s | Menda' }`.
 * - Descriptions: one sentence, plain English, ≤ 160 characters.
 * - Dynamic pages (diagnosis/[id], match/[id], report/[id]) export a helper
 *   function that builds metadata from the fetched record.
 * - Non-indexed pages (admin, onboarding) set robots: noindex.
 *
 * URL convention
 * ──────────────
 * One word, lowercase. Action verbs for flow steps, nouns for content.
 * Everything contractor-related lives under /contractors/*.
 *
 *   /                      Home
 *   /start                 Upload photo and begin diagnosis  (was /welcome)
 *   /diagnosis             Redirect → /start
 *   /diagnosis/[id]        Diagnosis result
 *   /match/[id]            Provider match results
 *   /report/[id]           Printable diagnosis report
 *   /contractors           Contractor landing page           (was /pro/join)
 *   /contractors/network   Contractor onboarding            (was /pro/onboard)
 *   /contractors/[id]      Contractor public profile         (was /pro/[id])
 *   /mobile                QR / open-on-phone redirect       (was /open-on-phone)
 *   /auth                  Sign in
 *   /auth/register         Create account
 *   /auth/forgot           Forgot password
 *   /auth/reset            Reset password
 *   /contact               Contact
 *   /about                 About
 *   /privacy               Privacy policy
 *   /terms                 Terms of service
 *   /admin                 Admin (noindex)
 */

import type { Metadata } from 'next';
import { BRAND_NAME } from '@/lib/brand-system';

// ── Shared site constants ──────────────────────────────────────────────────────

export const SITE_NAME = BRAND_NAME;
export const SITE_URL = 'https://scandio.co.za';
export const SITE_OG_IMAGE = '/og-menda.jpg';

// ── Public homeowner pages ─────────────────────────────────────────────────────

export const META_HOME: Metadata = {
    title: {
        absolute: 'Home Fault Diagnosis — Free Written Report | Menda',
    },
    description:
        'Upload a photo of any home fault and get a free written diagnosis in under 60 seconds. Plumbing, electrical, damp, roofing — Western Cape homeowners only.',
};

export const META_START: Metadata = {
    title: 'Start a diagnosis',
    description:
        'Upload a photo of your home maintenance problem and get a free written diagnosis. No account required.',
};

export const META_DIAGNOSIS_INDEX: Metadata = {
    title: 'Your diagnosis',
    description: 'Review your Menda home maintenance diagnosis and continue to find a local specialist.',
    robots: { index: false, follow: false },
};

export const META_MATCH_INDEX: Metadata = {
    title: 'Find providers',
    description: 'Match with local home maintenance providers based on your Menda diagnosis.',
    robots: { index: false, follow: false },
};

// ── Dynamic page metadata helpers ─────────────────────────────────────────────

/** Build metadata for /diagnosis/[id] */
export function buildDiagnosisMeta(diagnosisTitle: string | null): Metadata {
    const label = diagnosisTitle ? diagnosisTitle.slice(0, 55) : 'Your diagnosis';
    return {
        title: label,
        description: 'Review your Menda home maintenance diagnosis and find a specialist in the Western Cape.',
    };
}

/** Build metadata for /match/[id] */
export function buildMatchMeta(diagnosisTitle: string | null): Metadata {
    const label = diagnosisTitle ? diagnosisTitle.slice(0, 55) : 'Provider results';
    return {
        title: `Providers — ${label}`,
        description: 'Find and contact local home maintenance specialists matched to your Menda diagnosis.',
    };
}

/** Build metadata for /report/[id] */
export function buildReportMeta(diagnosisTitle: string | null): Metadata {
    const label = diagnosisTitle ? diagnosisTitle.slice(0, 55) : 'Diagnosis report';
    return {
        title: `${label} — Report`,
        description: 'View your Menda home maintenance diagnosis report.',
    };
}

// ── Contractor pages ───────────────────────────────────────────────────────────

export const META_CONTRACTORS: Metadata = {
    title: 'Join as a contractor',
    description:
        'Receive informed homeowner enquiries in the Western Cape. Homeowners arrive with a written diagnosis in hand. Free to join. No commission.',
};

export const META_CONTRACTORS_ONBOARD: Metadata = {
    title: 'Contractor setup',
    description: 'Complete your Menda contractor profile and service areas.',
    robots: { index: false, follow: false },
};

/** Build metadata for /contractors/[id] — contractor public profile */
export function buildContractorMeta(contractorName: string | null): Metadata {
    const name = contractorName ?? 'Contractor';
    return {
        title: name,
        description: `View ${name}'s profile, reviews, and contact details on Menda.`,
    };
}

// ── Auth pages ────────────────────────────────────────────────────────────────

export const META_SIGN_IN: Metadata = {
    title: 'Sign in',
    description: 'Sign in to your Menda account.',
    robots: { index: false, follow: false },
};

export const META_REGISTER: Metadata = {
    title: 'Create account',
    description: 'Create your free Menda account.',
    robots: { index: false, follow: false },
};

export const META_FORGOT_PASSWORD: Metadata = {
    title: 'Forgot password',
    description: 'Reset your Menda account password.',
    robots: { index: false, follow: false },
};

export const META_RESET_PASSWORD: Metadata = {
    title: 'Reset password',
    description: 'Choose a new password for your Menda account.',
    robots: { index: false, follow: false },
};

// ── Static content pages ──────────────────────────────────────────────────────

export const META_CONTACT: Metadata = {
    title: 'Contact us',
    description: 'Get in touch with Menda for homeowner, contractor, or partnership enquiries.',
};

export const META_ABOUT: Metadata = {
    title: 'About',
    description:
        'Menda gives Western Cape homeowners a clear written diagnosis of home maintenance faults before the first provider call. Founded 2025 in Cape Town.',
};

export const META_PRIVACY: Metadata = {
    title: 'Privacy policy',
    description: 'How Menda collects, stores, and uses personal information under POPIA.',
};

export const META_TERMS: Metadata = {
    title: 'Terms of service',
    description: 'Terms and conditions for using Menda in South Africa.',
};

// ── Utility / redirect pages ──────────────────────────────────────────────────

export const META_MOBILE: Metadata = {
    title: 'Open on mobile',
    description: 'Scan the QR code to continue Menda on your phone.',
    robots: { index: false, follow: false },
};

export const META_DESIGN_PREVIEW: Metadata = {
    title: 'Design preview',
    description: 'Menda design system preview for typography, color, and UX component validation.',
    robots: { index: false, follow: false },
};

// ── Admin (all noindex) ───────────────────────────────────────────────────────

const ADMIN_ROBOTS = { index: false, follow: false } as const;

export const META_ADMIN: Metadata = { title: 'Dashboard', robots: ADMIN_ROBOTS };
export const META_ADMIN_LOGIN: Metadata = { title: 'Admin sign in', robots: ADMIN_ROBOTS };
export const META_ADMIN_ANALYTICS: Metadata = { title: 'Analytics', robots: ADMIN_ROBOTS };
export const META_ADMIN_CONTACT: Metadata = { title: 'Contact messages', robots: ADMIN_ROBOTS };
export const META_ADMIN_GALLERY: Metadata = { title: 'Gallery', robots: ADMIN_ROBOTS };
export const META_ADMIN_PROVIDERS: Metadata = { title: 'Providers', robots: ADMIN_ROBOTS };
export const META_ADMIN_REVIEWS: Metadata = { title: 'Reviews', robots: ADMIN_ROBOTS };
