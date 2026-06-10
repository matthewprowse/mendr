/**
 * Tests for site-url.ts — getSiteUrl, getAppOrigin
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
    savedEnv.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL;
    savedEnv.NEXT_PUBLIC_APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN;
    savedEnv.VERCEL_URL = process.env.VERCEL_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_ORIGIN;
    delete process.env.VERCEL_URL;
});

afterEach(() => {
    if (savedEnv.NEXT_PUBLIC_APP_URL !== undefined) {
        process.env.NEXT_PUBLIC_APP_URL = savedEnv.NEXT_PUBLIC_APP_URL;
    } else {
        delete process.env.NEXT_PUBLIC_APP_URL;
    }
    if (savedEnv.NEXT_PUBLIC_APP_ORIGIN !== undefined) {
        process.env.NEXT_PUBLIC_APP_ORIGIN = savedEnv.NEXT_PUBLIC_APP_ORIGIN;
    } else {
        delete process.env.NEXT_PUBLIC_APP_ORIGIN;
    }
    if (savedEnv.VERCEL_URL !== undefined) {
        process.env.VERCEL_URL = savedEnv.VERCEL_URL;
    } else {
        delete process.env.VERCEL_URL;
    }
});

// ── getSiteUrl ────────────────────────────────────────────────────────────────

describe('getSiteUrl', () => {
    it('returns NEXT_PUBLIC_APP_URL without trailing slash', async () => {
        process.env.NEXT_PUBLIC_APP_URL = 'https://mendr.co.za/';
        // Need dynamic import because env is read at call time
        const { getSiteUrl } = await import('../site-url');
        expect(getSiteUrl()).toBe('https://mendr.co.za');
    });

    it('returns NEXT_PUBLIC_APP_URL as-is when there is no trailing slash', async () => {
        process.env.NEXT_PUBLIC_APP_URL = 'https://mendr.co.za';
        const { getSiteUrl } = await import('../site-url');
        expect(getSiteUrl()).toBe('https://mendr.co.za');
    });

    it('returns https://VERCEL_URL when NEXT_PUBLIC_APP_URL is not set', async () => {
        process.env.VERCEL_URL = 'mendr-preview.vercel.app';
        const { getSiteUrl } = await import('../site-url');
        expect(getSiteUrl()).toBe('https://mendr-preview.vercel.app');
    });

    it('falls back to the hardcoded domain when neither env var is set', async () => {
        const { getSiteUrl } = await import('../site-url');
        const url = getSiteUrl();
        expect(url).toMatch(/^https:\/\//);
        expect(url.length).toBeGreaterThan(8);
    });

    it('never returns a trailing slash', async () => {
        process.env.NEXT_PUBLIC_APP_URL = 'https://mendr.co.za/';
        const { getSiteUrl } = await import('../site-url');
        expect(getSiteUrl()).not.toMatch(/\/$/);
    });
});

// ── getAppOrigin ──────────────────────────────────────────────────────────────

describe('getAppOrigin', () => {
    it('returns NEXT_PUBLIC_APP_ORIGIN without trailing slash', async () => {
        process.env.NEXT_PUBLIC_APP_ORIGIN = 'https://app.mendr.co.za/';
        const { getAppOrigin } = await import('../site-url');
        expect(getAppOrigin()).toBe('https://app.mendr.co.za');
    });

    it('falls back to the hardcoded app origin when env var is not set', async () => {
        const { getAppOrigin } = await import('../site-url');
        const origin = getAppOrigin();
        expect(origin).toMatch(/^https:\/\//);
    });

    it('never returns a trailing slash', async () => {
        process.env.NEXT_PUBLIC_APP_ORIGIN = 'https://app.mendr.co.za/';
        const { getAppOrigin } = await import('../site-url');
        expect(getAppOrigin()).not.toMatch(/\/$/);
    });
});
