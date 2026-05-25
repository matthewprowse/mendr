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
    const e164 = toSaE164(value);
    if (!e164) return value.replace(/[^\d+\s]/g, '').slice(0, 16);
    const n = e164.slice(3);
    return `+27 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 9)}`;
}

export function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}
