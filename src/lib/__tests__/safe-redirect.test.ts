import { describe, it, expect } from 'vitest';
import { safeRedirectPath } from '../safe-redirect';

describe('safeRedirectPath', () => {
    // ── Happy path ────────────────────────────────────────────────────────────
    it('returns the path for a simple same-origin path', () => {
        expect(safeRedirectPath('/dashboard', '/')).toBe('/dashboard');
    });

    it('preserves query string and hash', () => {
        expect(safeRedirectPath('/search?q=test#anchor', '/')).toBe('/search?q=test#anchor');
    });

    it('returns fallback when input is null', () => {
        expect(safeRedirectPath(null, '/home')).toBe('/home');
    });

    it('returns fallback when input is undefined', () => {
        expect(safeRedirectPath(undefined, '/home')).toBe('/home');
    });

    it('returns fallback for empty string', () => {
        expect(safeRedirectPath('', '/home')).toBe('/home');
    });

    // ── Open-redirect rejection ───────────────────────────────────────────────
    it('rejects absolute URL with http scheme', () => {
        expect(safeRedirectPath('https://evil.com/steal', '/')).toBe('/');
    });

    it('rejects protocol-relative URL', () => {
        expect(safeRedirectPath('//evil.com/steal', '/')).toBe('/');
    });

    it('rejects javascript: scheme', () => {
        expect(safeRedirectPath('javascript:alert(1)', '/')).toBe('/');
    });

    it('rejects backslash-prefixed URL', () => {
        expect(safeRedirectPath('\\\\evil.com', '/')).toBe('/');
    });

    it('rejects path containing null byte', () => {
        expect(safeRedirectPath('/path\0evil', '/')).toBe('/');
    });

    it('rejects data: URL', () => {
        expect(safeRedirectPath('data:text/html,<h1>evil</h1>', '/')).toBe('/');
    });

    // ── allowedPathPrefixes ───────────────────────────────────────────────────
    it('allows exact prefix match', () => {
        expect(safeRedirectPath('/admin', '/', { allowedPathPrefixes: ['/admin'] })).toBe('/admin');
    });

    it('allows sub-path of allowed prefix', () => {
        expect(safeRedirectPath('/admin/providers', '/', { allowedPathPrefixes: ['/admin'] })).toBe('/admin/providers');
    });

    it('rejects path that starts with prefix string but not at segment boundary', () => {
        expect(safeRedirectPath('/administration', '/', { allowedPathPrefixes: ['/admin'] })).toBe('/');
    });

    it('rejects path outside allowed prefix', () => {
        expect(safeRedirectPath('/dashboard', '/', { allowedPathPrefixes: ['/admin'] })).toBe('/');
    });

    it('returns fallback when no allowed prefix matches', () => {
        expect(safeRedirectPath('/other', '/admin', { allowedPathPrefixes: ['/admin'] })).toBe('/admin');
    });

    // ── Fallback normalisation ────────────────────────────────────────────────
    it('normalises a non-slash fallback to /', () => {
        // A fallback without a leading slash is itself unsafe — should degrade to /
        expect(safeRedirectPath('https://evil.com', 'bad-fallback')).toBe('/');
    });
});
