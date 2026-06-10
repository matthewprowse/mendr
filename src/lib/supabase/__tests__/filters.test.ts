import { describe, it, expect } from 'vitest';
import { escapeIlikePattern, sanitizeOrIlikeTerm } from '@/lib/supabase/filters';

describe('escapeIlikePattern', () => {
    it('escapes ilike wildcards', () => {
        expect(escapeIlikePattern('100%_off')).toBe('100\\%\\_off');
        expect(escapeIlikePattern('a\\b')).toBe('a\\\\b');
    });
});

describe('sanitizeOrIlikeTerm (M7)', () => {
    it('strips or-filter metacharacters so a term cannot inject conditions', () => {
        const malicious = 'x,is_admin.eq.true)';
        const out = sanitizeOrIlikeTerm(malicious);
        expect(out).not.toContain(',');
        expect(out).not.toContain('(');
        expect(out).not.toContain(')');
    });

    it('escapes wildcards and keeps ordinary terms usable', () => {
        expect(sanitizeOrIlikeTerm('Joe Plumbing')).toBe('Joe Plumbing');
        expect(sanitizeOrIlikeTerm('50%')).toBe('50\\%');
    });
});
