/**
 * Unit tests for email design tokens — specifically the two functions with
 * logic: `getEmailAssetOrigin` (env precedence) and `anthropicSansFontFaceCss`
 * (font-face block generation against an absolute origin).
 *
 * The colour/radius/font-stack constants are plain data and don't need tests;
 * the render-smoke suite already exercises them through every template.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    getEmailAssetOrigin,
    anthropicSansFontFaceCss,
    EMAIL_FONT_STACK,
} from '../tokens';

const SAVED: Record<string, string | undefined> = {};
function saveEnv(...keys: string[]) {
    for (const k of keys) SAVED[k] = process.env[k];
}
function restoreEnv() {
    for (const [k, v] of Object.entries(SAVED)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
}

beforeEach(() => {
    saveEnv('AUTH_EMAIL_PUBLIC_URL', 'NEXT_PUBLIC_APP_URL', 'VERCEL_URL');
    delete process.env.AUTH_EMAIL_PUBLIC_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
});

afterEach(() => {
    restoreEnv();
});

describe('getEmailAssetOrigin — precedence', () => {
    it('prefers AUTH_EMAIL_PUBLIC_URL above all others', () => {
        process.env.AUTH_EMAIL_PUBLIC_URL = 'https://assets.example.test';
        process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test';
        process.env.VERCEL_URL = 'preview.vercel.app';
        expect(getEmailAssetOrigin()).toBe('https://assets.example.test');
    });

    it('falls back to NEXT_PUBLIC_APP_URL when the override is absent', () => {
        process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test';
        process.env.VERCEL_URL = 'preview.vercel.app';
        expect(getEmailAssetOrigin()).toBe('https://app.example.test');
    });

    it('synthesises an https origin from VERCEL_URL when no explicit URL is set', () => {
        process.env.VERCEL_URL = 'preview-abc.vercel.app';
        expect(getEmailAssetOrigin()).toBe('https://preview-abc.vercel.app');
    });

    it('falls back to the canonical site URL when nothing is configured', () => {
        // getSiteUrl() default — keep in sync with site-url.ts.
        expect(getEmailAssetOrigin()).toBe('https://mendr.co.za');
    });

    it('strips any trailing slashes from the resolved origin', () => {
        process.env.AUTH_EMAIL_PUBLIC_URL = 'https://assets.example.test///';
        expect(getEmailAssetOrigin()).toBe('https://assets.example.test');
    });
});

describe('anthropicSansFontFaceCss', () => {
    it('emits one @font-face block per shipped weight', () => {
        const css = anthropicSansFontFaceCss('https://assets.example.test');
        const blocks = css.match(/@font-face/g) ?? [];
        // tokens.ts ships Light/Regular/Medium/Semibold/Bold/Extrabold = 6 faces.
        expect(blocks).toHaveLength(6);
        expect(css).toContain('font-weight: 300');
        expect(css).toContain('font-weight: 800');
    });

    it('points every src at an absolute /fonts URL under the given origin', () => {
        const css = anthropicSansFontFaceCss('https://assets.example.test');
        const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);
        expect(urls).not.toHaveLength(0);
        for (const url of urls) {
            expect(url.startsWith('https://assets.example.test/fonts/')).toBe(true);
            expect(url.endsWith('.otf')).toBe(true);
        }
    });

    it('normalises a trailing slash on the origin so URLs are not doubled', () => {
        const css = anthropicSansFontFaceCss('https://assets.example.test/');
        expect(css).not.toContain('//fonts/');
        expect(css).toContain('https://assets.example.test/fonts/');
    });

    it('declares the Anthropic Sans Text family and swap display', () => {
        const css = anthropicSansFontFaceCss('https://x.test');
        expect(css).toContain("font-family: 'Anthropic Sans Text'");
        expect(css).toContain('font-display: swap');
        expect(css).toContain("format('opentype')");
    });
});

describe('EMAIL_FONT_STACK', () => {
    it('lists Anthropic Sans Text first, then a system fallback', () => {
        expect(EMAIL_FONT_STACK.startsWith("'Anthropic Sans Text'")).toBe(true);
        expect(EMAIL_FONT_STACK).toContain('sans-serif');
    });
});
