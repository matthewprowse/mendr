/**
 * Pure utility functions used across the contractor onboarding wizard.
 * No React, no Supabase — safe to import from anywhere (tests included).
 */

export function toTitleCaseWords(value: string): string {
    return value
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

export function normalizeToken(value: string): string {
    return toTitleCaseWords(value.replace(/\s+/g, ' ').trim());
}

export function tokenizeCsv(value: string): string[] {
    return value.split(',').map((x) => normalizeToken(x)).filter(Boolean);
}

export function normalizeWebsiteToHttps(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    const noProto = trimmed.replace(/^https?:\/\//i, '').replace(/\/+$/g, '');
    return `https://${noProto}`;
}

export function toSaE164(value: string): string | null {
    const digitsOnly = value.replace(/\D/g, '');
    let digits = digitsOnly;
    if (digits.startsWith('27')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = digits.slice(1);
    if (!/^(\d{9})$/.test(digits)) return null;
    return `+27${digits}`;
}

export function formatSaPhoneDisplay(value: string): string {
    // Normalise to the 9 national digits (dropping +27 / 0 prefixes), capped so
    // extra typed/pasted digits are ignored, then format in the familiar SA
    // local style: 0XX XXX XXXX. Storage still converts to +27 via toSaE164.
    let digits = value.replace(/\D/g, '');
    if (digits.startsWith('27')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = digits.slice(1);
    digits = digits.slice(0, 9);
    if (!digits) return '';
    const a = digits.slice(0, 2);
    const b = digits.slice(2, 5);
    const c = digits.slice(5, 9);
    return [`0${a}`, b, c].filter(Boolean).join(' ');
}

export function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

/**
 * Shorten a Google formatted address to street, suburb, city — dropping the
 * trailing postal code and country. e.g.
 *   "6 Mount Rd, Rondebosch, Cape Town, 7700, South Africa"
 *     → "6 Mount Rd, Rondebosch, Cape Town"
 */
export function shortenSaAddress(formatted: string): string {
    return formatted
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .filter((segment) => segment !== 'South Africa' && !/^\d{4}$/.test(segment))
        .join(', ');
}
