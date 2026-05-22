/**
 * Ported from scripts/test-llm-content-guard.ts. Covers the provider-enrichment
 * content guard: validate verdicts, per-record validation, and masking.
 */
import { describe, it, expect } from 'vitest';
import {
    maskUnsafeContent,
    validateLlmContentRecord,
    validateLlmContentSafe,
} from '../llm-content-guard';

describe('validateLlmContentSafe — safe passthrough', () => {
    it('accepts clean prose', () => {
        const verdict = validateLlmContentSafe(
            'CapeFlow Plumbing handles emergency leaks across the southern suburbs. Family run since 2009 with three full-time technicians.'
        );
        expect(verdict.ok).toBe(true);
    });

    it('accepts an empty string', () => {
        expect(validateLlmContentSafe('').ok).toBe(true);
    });

    it('accepts whitespace-only input', () => {
        expect(validateLlmContentSafe('   \n  ').ok).toBe(true);
    });

    it('accepts prose with normal punctuation', () => {
        expect(
            validateLlmContentSafe('Same-day callouts. Transparent quoting. Friendly team.').ok
        ).toBe(true);
    });
});

describe('validateLlmContentSafe — html injection', () => {
    it('rejects inline html tags', () => {
        const verdict = validateLlmContentSafe(
            'Family run <strong>since 2009</strong> with three technicians.'
        );
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) {
            expect(verdict.reason).toBe('html');
            expect(typeof verdict.sample).toBe('string');
            expect(verdict.sample.length).toBeGreaterThan(0);
        }
    });

    it('rejects html attributes', () => {
        const verdict = validateLlmContentSafe('Visit our team href="https://example.com" today.');
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.reason).toBe('html');
    });

    it('rejects html entities', () => {
        const verdict = validateLlmContentSafe('Family &amp; team since 2009.');
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.reason).toBe('html');
    });
});

describe('validateLlmContentSafe — css/style leakage', () => {
    it('rejects css selector blocks', () => {
        const verdict = validateLlmContentSafe('.hero { font-family: Arial; } We fix leaks.');
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.reason).toBe('css');
    });

    it('rejects css property lines', () => {
        const verdict = validateLlmContentSafe(
            'font-family: Arial, sans-serif; padding: 12px; color: #16120E;'
        );
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.reason).toBe('css');
    });

    it('rejects media queries', () => {
        const verdict = validateLlmContentSafe('@media (max-width: 768px) { display: none; }');
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.reason).toBe('css');
    });

    it('rejects rgb() functions', () => {
        const verdict = validateLlmContentSafe(
            'background: rgb(255, 255, 255); experienced team.'
        );
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.reason).toBe('css');
    });

    it('rejects px units', () => {
        const verdict = validateLlmContentSafe('Margin spacing of 12px around the team photo.');
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.reason).toBe('css');
    });

    it('rejects rem units', () => {
        const verdict = validateLlmContentSafe('We span 4rem of the cape.');
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.reason).toBe('css');
    });

    it('rejects !important leakage', () => {
        const verdict = validateLlmContentSafe('Our service is reliable !important and tidy.');
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.reason).toBe('css');
    });

    it('rejects base64 image data URIs', () => {
        const verdict = validateLlmContentSafe(
            'About us data:image/png;base64,iVBORw0KGgo... etc.'
        );
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.reason).toBe('css');
    });
});

describe('validateLlmContentSafe — structural noise', () => {
    it('rejects code fences', () => {
        const verdict = validateLlmContentSafe('```\nabout: family run since 2009\n```');
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.reason).toBe('structural');
    });

    it('rejects json blobs', () => {
        const verdict = validateLlmContentSafe('{"about":"family run since 2009"}');
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.reason).toBe('structural');
    });

    it('rejects escape sequence leakage', () => {
        const verdict = validateLlmContentSafe('Family run since 2009.\\n\\nThree technicians.');
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.reason).toBe('structural');
    });

    it('rejects all-caps banners', () => {
        const verdict = validateLlmContentSafe(
            'COOKIES POLICY ACCEPTANCE NOTICE\nFamily run since 2009.'
        );
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.reason).toBe('structural');
    });
});

describe('validateLlmContentSafe — low-signal residue', () => {
    it('rejects scrape residue with too many structural tokens', () => {
        const verdict = validateLlmContentSafe(
            Array.from({ length: 12 }, () => 'div li ul section header footer').join(' ')
        );
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.reason).toBe('low_signal');
    });
});

describe('validateLlmContentRecord', () => {
    it('returns only the failing fields and their reasons', () => {
        const failures = validateLlmContentRecord({
            about_business: 'Family run since 2009. Same-day callouts.',
            past_work: '<div class="card">Replaced geyser</div>',
            bio: '',
            customer_review_summary: 'Punctual and tidy.',
        });
        expect(Object.keys(failures)).toEqual(['past_work']);
        expect(failures.past_work?.reason).toBe('html');
    });
});

describe('maskUnsafeContent', () => {
    it('strips html tags but preserves surrounding text', () => {
        expect(
            maskUnsafeContent(
                'Family run since 2009.<br/> Three full-time <span>technicians</span>.'
            )
        ).toBe('Family run since 2009. Three full-time technicians.');
    });

    it('strips css fragments and preserves safe text', () => {
        const masked = maskUnsafeContent(
            'Margin 12px and font-family: Arial; matter little to customers.'
        );
        expect(masked).not.toMatch(/12px/);
        expect(masked).not.toMatch(/font-family/i);
        expect(masked).toMatch(/Margin/);
        expect(masked).toMatch(/customers/);
    });
});
