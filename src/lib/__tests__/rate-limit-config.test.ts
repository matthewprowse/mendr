import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { getCallerIp, isRateLimitBypassed, RATE_LIMITS } from '@/lib/rate-limit-config';

function reqWith(headers: Record<string, string> = {}): NextRequest {
    return { headers: new Headers(headers) } as unknown as NextRequest;
}

const envKeys = ['DISABLE_RATE_LIMIT', 'RATE_LIMIT_BYPASS_IPS'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
    for (const k of envKeys) {
        saved[k] = process.env[k];
        delete process.env[k];
    }
});
afterEach(() => {
    for (const k of envKeys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
    }
});

describe('getCallerIp', () => {
    it('uses the first entry of x-forwarded-for, trimmed', () => {
        expect(getCallerIp(reqWith({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
        expect(getCallerIp(reqWith({ 'x-forwarded-for': '  1.2.3.4  ' }))).toBe('1.2.3.4');
    });

    it('falls back to x-real-ip', () => {
        expect(getCallerIp(reqWith({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
    });

    it('prefers x-forwarded-for over x-real-ip', () => {
        expect(
            getCallerIp(reqWith({ 'x-forwarded-for': '1.1.1.1', 'x-real-ip': '9.9.9.9' })),
        ).toBe('1.1.1.1');
    });

    it('returns null when neither header is present', () => {
        expect(getCallerIp(reqWith())).toBeNull();
    });
});

describe('isRateLimitBypassed', () => {
    it('bypasses everything when DISABLE_RATE_LIMIT is exactly "true"', () => {
        process.env.DISABLE_RATE_LIMIT = 'true';
        expect(isRateLimitBypassed(reqWith())).toBe(true);
    });

    it('does not bypass for other truthy-looking values', () => {
        process.env.DISABLE_RATE_LIMIT = '1';
        expect(isRateLimitBypassed(reqWith({ 'x-real-ip': '8.8.8.8' }))).toBe(false);
    });

    it('bypasses an IP listed in RATE_LIMIT_BYPASS_IPS', () => {
        process.env.RATE_LIMIT_BYPASS_IPS = '127.0.0.1, ::1';
        expect(isRateLimitBypassed(reqWith({ 'x-real-ip': '127.0.0.1' }))).toBe(true);
        expect(isRateLimitBypassed(reqWith({ 'x-forwarded-for': '::1, 1.2.3.4' }))).toBe(true);
    });

    it('does not bypass an unlisted IP or a request with no IP', () => {
        process.env.RATE_LIMIT_BYPASS_IPS = '127.0.0.1';
        expect(isRateLimitBypassed(reqWith({ 'x-real-ip': '8.8.8.8' }))).toBe(false);
        expect(isRateLimitBypassed(reqWith())).toBe(false);
    });
});

describe('RATE_LIMITS config', () => {
    it('every bucket has a positive window and max', () => {
        for (const [bucket, cfg] of Object.entries(RATE_LIMITS)) {
            expect(cfg.windowMs, `${bucket}.windowMs`).toBeGreaterThan(0);
            expect(cfg.max, `${bucket}.max`).toBeGreaterThan(0);
        }
    });

    it('keeps the expensive and destructive buckets tight', () => {
        expect(RATE_LIMITS.diagnose).toEqual({ windowMs: 10 * 60 * 1000, max: 10 });
        expect(RATE_LIMITS.accountDelete.max).toBe(3);
        expect(RATE_LIMITS.providerApply.max).toBe(3);
    });
});
