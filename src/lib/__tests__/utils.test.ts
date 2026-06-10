/**
 * Tests for utils.ts — pure utility helpers.
 */

import { describe, it, expect } from 'vitest';
import {
    cn,
    extractMessageFromRaw,
    toWhatsAppPhone,
    isWhatsAppCapablePhone,
    normalizeWebsiteUrl,
    formatApiError,
    extractRandRanges,
    parseRepairReplacementRanges,
    formatBusinessName,
    sanitizeAiContent,
} from '../utils';

// ── cn ────────────────────────────────────────────────────────────────────────

describe('cn', () => {
    it('merges class names', () => {
        expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('handles conditional classes', () => {
        expect(cn('base', false && 'off', 'on')).toBe('base on');
    });

    it('deduplicates tailwind classes (last wins)', () => {
        const result = cn('p-4', 'p-8');
        expect(result).toContain('p-8');
        expect(result).not.toContain('p-4');
    });
});

// ── extractMessageFromRaw ─────────────────────────────────────────────────────

describe('extractMessageFromRaw', () => {
    it('extracts from <message> tags', () => {
        const raw = '<message>The geyser is leaking.</message>';
        expect(extractMessageFromRaw(raw)).toBe('The geyser is leaking.');
    });

    it('extracts from JSON "message" key (double quotes)', () => {
        const raw = '{"message": "Pipe burst detected"}';
        expect(extractMessageFromRaw(raw)).toBe('Pipe burst detected');
    });

    it('extracts from JSON "message" key (single quotes)', () => {
        const raw = "{'message': 'Geyser fault'}";
        expect(extractMessageFromRaw(raw)).toBe('Geyser fault');
    });

    it('returns plain text when no pattern matches but text is long enough', () => {
        const raw = 'This is a plain text response longer than thirty characters total.';
        const result = extractMessageFromRaw(raw);
        expect(result).not.toBeNull();
    });

    it('returns null for short unrecognised content', () => {
        const result = extractMessageFromRaw('{nope}');
        expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(extractMessageFromRaw('')).toBeNull();
    });

    it('strips <thought> blocks before returning plain text fallback', () => {
        const raw = '<thought>Internal reasoning</thought>This is the actual message content from the AI response for a real fault.';
        const result = extractMessageFromRaw(raw);
        expect(result).not.toContain('Internal reasoning');
    });
});

// ── toWhatsAppPhone ───────────────────────────────────────────────────────────

describe('toWhatsAppPhone', () => {
    it('returns null for null/undefined/empty', () => {
        expect(toWhatsAppPhone(null)).toBeNull();
        expect(toWhatsAppPhone(undefined)).toBeNull();
        expect(toWhatsAppPhone('')).toBeNull();
        expect(toWhatsAppPhone('   ')).toBeNull();
    });

    it('returns null when fewer than 9 digits', () => {
        expect(toWhatsAppPhone('0721234')).toBeNull(); // 7 digits
    });

    it('converts 0XX XXXXXXX to 27XXXXXXXXX', () => {
        expect(toWhatsAppPhone('0721234567')).toBe('27721234567');
    });

    it('keeps already-international 27-prefixed numbers', () => {
        expect(toWhatsAppPhone('27721234567')).toBe('27721234567');
    });

    it('strips leading 00 prefix', () => {
        expect(toWhatsAppPhone('0027721234567')).toBe('27721234567');
    });

    it('handles formatted numbers with spaces and dashes', () => {
        expect(toWhatsAppPhone('+27 72 123 4567')).toBe('27721234567');
    });

    it('converts 9-digit number without leading 0 to 27+digits', () => {
        expect(toWhatsAppPhone('721234567')).toBe('27721234567');
    });
});

// ── isWhatsAppCapablePhone ────────────────────────────────────────────────────

describe('isWhatsAppCapablePhone', () => {
    it('returns true for a valid SA mobile number', () => {
        expect(isWhatsAppCapablePhone('0721234567')).toBe(true);  // 27 7x
        expect(isWhatsAppCapablePhone('0811234567')).toBe(true);  // 27 8x
        expect(isWhatsAppCapablePhone('0661234567')).toBe(true);  // 27 6x
    });

    it('returns false for a SA landline', () => {
        expect(isWhatsAppCapablePhone('0211234567')).toBe(false); // 27 2x
    });

    it('returns false for null/undefined', () => {
        expect(isWhatsAppCapablePhone(null)).toBe(false);
        expect(isWhatsAppCapablePhone(undefined)).toBe(false);
    });

    it('returns false for too-short number', () => {
        expect(isWhatsAppCapablePhone('123')).toBe(false);
    });
});

// ── normalizeWebsiteUrl ───────────────────────────────────────────────────────

describe('normalizeWebsiteUrl', () => {
    it('returns null for empty/null input', () => {
        expect(normalizeWebsiteUrl(null)).toBeNull();
        expect(normalizeWebsiteUrl(undefined)).toBeNull();
        expect(normalizeWebsiteUrl('')).toBeNull();
        expect(normalizeWebsiteUrl('   ')).toBeNull();
    });

    it('passes through already-valid https URL', () => {
        expect(normalizeWebsiteUrl('https://mendr.co.za')).toBe('https://mendr.co.za');
    });

    it('passes through already-valid http URL', () => {
        expect(normalizeWebsiteUrl('http://example.com')).toBe('http://example.com');
    });

    it('prepends https:// to domain-only input', () => {
        expect(normalizeWebsiteUrl('mendr.co.za')).toBe('https://mendr.co.za');
    });
});

// ── formatApiError ────────────────────────────────────────────────────────────

describe('formatApiError', () => {
    it('returns Error.message for Error instances', () => {
        expect(formatApiError(new Error('something failed'))).toBe('something failed');
    });

    it('returns string errors as-is', () => {
        expect(formatApiError('bad request')).toBe('bad request');
    });

    it('returns "Internal error" for unknown types', () => {
        expect(formatApiError({ code: 500 })).toBe('Internal error');
        expect(formatApiError(42)).toBe('Internal error');
    });
});

// ── extractRandRanges ─────────────────────────────────────────────────────────

describe('extractRandRanges', () => {
    it('returns empty array for empty/falsy input', () => {
        expect(extractRandRanges('')).toEqual([]);
        expect(extractRandRanges(null as unknown as string)).toEqual([]);
    });

    it('extracts a simple R range with dash', () => {
        const result = extractRandRanges('Expect R350–R500 for this repair.');
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toContain('R350');
    });

    it('extracts a range with "to" separator', () => {
        const result = extractRandRanges('Costs R1,200 to R2,500');
        expect(result.length).toBeGreaterThan(0);
    });

    it('extracts a single Rand amount', () => {
        const result = extractRandRanges('Costs R800 for a standard callout.');
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toContain('R800');
    });

    it('deduplicates identical ranges', () => {
        const result = extractRandRanges('R350–R500, R350–R500, R800');
        const unique = new Set(result);
        expect(result.length).toBe(unique.size);
    });
});

// ── parseRepairReplacementRanges ──────────────────────────────────────────────

describe('parseRepairReplacementRanges', () => {
    it('returns nulls for empty input', () => {
        expect(parseRepairReplacementRanges('')).toEqual({ repair: null, replacement: null });
    });

    it('extracts repair range when "repair" keyword is present', () => {
        const result = parseRepairReplacementRanges('Repair: R500–R800. Replacement: R2,000–R4,000.');
        expect(result.repair).toContain('R500');
        expect(result.replacement).toContain('R2');
    });

    it('falls back to first/second extracted range when keywords are absent', () => {
        const result = parseRepairReplacementRanges('Costs R500–R800 or R2,000 for full replacement.');
        expect(result.repair).toBeTruthy();
    });
});

// ── formatBusinessName ────────────────────────────────────────────────────────

describe('formatBusinessName', () => {
    it('returns empty string for null/undefined/empty', () => {
        expect(formatBusinessName(null)).toBe('');
        expect(formatBusinessName(undefined)).toBe('');
        expect(formatBusinessName('')).toBe('');
        expect(formatBusinessName('   ')).toBe('');
    });

    it('removes " Pty Ltd" suffix', () => {
        const result = formatBusinessName('Smith Plumbing Pty Ltd');
        expect(result).not.toContain('Pty');
        expect(result).not.toContain('Ltd');
    });

    it('replaces " AND " with " & "', () => {
        const result = formatBusinessName('Repair AND Restore');
        expect(result).toContain('&');
        expect(result.toLowerCase()).not.toContain(' and ');
    });

    it('strips trailing location suffix (Cape Town)', () => {
        const result = formatBusinessName('Best Plumbers Cape Town');
        expect(result.toLowerCase()).not.toContain('cape town');
    });

    it('strips trailing location suffix (Western Cape)', () => {
        const result = formatBusinessName('Top Roofers Western Cape');
        expect(result.toLowerCase()).not.toContain('western cape');
    });

    it('applies Title Case to words', () => {
        const result = formatBusinessName('QUICK PLUMBING REPAIRS');
        expect(result).toBe('Quick Plumbing Repairs');
    });

    it('strips marketing tag suffixes after " - "', () => {
        const result = formatBusinessName('Al Garage Door Solutions - New | Repairs | Automations');
        expect(result).not.toContain('Repairs');
        expect(result).toContain('Al Garage Door Solutions');
    });

    it('strips domain-style suffix (.co.za)', () => {
        const result = formatBusinessName('bestplumbers.co.za');
        expect(result.toLowerCase()).not.toContain('.co.za');
    });
});

// ── sanitizeAiContent ─────────────────────────────────────────────────────────

describe('sanitizeAiContent', () => {
    it('returns empty/falsy input unchanged', () => {
        expect(sanitizeAiContent('')).toBe('');
        expect(sanitizeAiContent('   ')).toBe('   ');
    });

    it('removes "The user seems ..." meta-commentary', () => {
        const result = sanitizeAiContent(
            'The geyser element is burnt out. The user seems frustrated by the situation.',
        );
        expect(result).not.toContain('The user seems');
        expect(result).toContain('element is burnt out');
    });

    it('removes "I need to ..." meta-commentary', () => {
        const result = sanitizeAiContent(
            'The issue is a burst pipe. I need to explain the repair process.',
        );
        expect(result).not.toContain('I need to');
    });

    it('removes "Let me ..." meta-commentary', () => {
        const result = sanitizeAiContent('Let me address the root cause. The DB board is faulty.');
        expect(result).not.toContain('Let me');
    });

    it('collapses triple newlines to double', () => {
        const result = sanitizeAiContent('Line one.\n\n\n\nLine two.');
        expect(result).not.toContain('\n\n\n');
    });

    it('leaves normal content untouched', () => {
        const clean = 'The geyser element has failed and needs replacement.';
        expect(sanitizeAiContent(clean)).toContain(clean);
    });
});
