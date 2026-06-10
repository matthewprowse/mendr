import { describe, it, expect } from 'vitest';
import { normalizeProviderName } from '../provider-display-name';

describe('normalizeProviderName', () => {
    it('returns an empty string for empty input', () => {
        expect(normalizeProviderName('')).toBe('');
    });

    it('trims whitespace-only input to empty', () => {
        expect(normalizeProviderName('   ')).toBe('');
    });

    it('applies a known override exactly', () => {
        expect(
            normalizeProviderName('AL Garage Door Solutions - New | Repairs | Automations')
        ).toBe('AL Garage Door Solutions');
    });

    it('matches overrides case-insensitively', () => {
        expect(normalizeProviderName('PLANET AUTOMATION (PTY)')).toBe('Planet Automation');
    });

    it('strips legal suffixes such as (Pty) Ltd', () => {
        expect(normalizeProviderName('Acme Plumbing (Pty) Ltd')).toBe('Acme Plumbing');
    });

    it('strips a trailing parenthesised entity suffix', () => {
        expect(normalizeProviderName('Bright Sparks (Pty)')).toBe('Bright Sparks');
    });

    it('drops a marketing tail after a spaced dash', () => {
        expect(normalizeProviderName('Cape Roofing - The Best In Town')).toBe('Cape Roofing');
    });

    it('preserves all-caps acronyms', () => {
        expect(normalizeProviderName('ABC Electrical')).toBe('ABC Electrical');
    });

    it('title-cases lowercase words', () => {
        expect(normalizeProviderName('joe the plumber')).toBe('Joe The Plumber');
    });

    it('preserves internal CamelCase tokens', () => {
        expect(normalizeProviderName('AutoFix services')).toBe('AutoFix Services');
    });

    it('applies Mc capitalisation', () => {
        expect(normalizeProviderName('mcdonald plumbing')).toBe('McDonald Plumbing');
    });

    it('applies Mac capitalisation', () => {
        expect(normalizeProviderName('macleod electric')).toBe('MacLeod Electric');
    });

    it('title-cases tokens split by a slash', () => {
        expect(normalizeProviderName('repairs/maintenance')).toBe('Repairs/Maintenance');
    });

    it('collapses multiple spaces', () => {
        expect(normalizeProviderName('Joe    Plumbing')).toBe('Joe Plumbing');
    });
});
