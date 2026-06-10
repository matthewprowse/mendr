import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/auth/cron-auth';

// The function only reads req.headers.get('authorization'), so a minimal stub
// with a real Headers instance is enough.
function reqWith(authorization?: string): NextRequest {
    return {
        headers: new Headers(authorization ? { authorization } : {}),
    } as unknown as NextRequest;
}

describe('isAuthorizedCronRequest', () => {
    const original = process.env.CRON_SECRET;
    beforeEach(() => {
        process.env.CRON_SECRET = 's3cret';
    });
    afterEach(() => {
        if (original === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = original;
    });

    it('accepts the exact Bearer secret', () => {
        expect(isAuthorizedCronRequest(reqWith('Bearer s3cret'))).toBe(true);
    });

    it('trims surrounding whitespace on the configured secret', () => {
        process.env.CRON_SECRET = '  s3cret  ';
        expect(isAuthorizedCronRequest(reqWith('Bearer s3cret'))).toBe(true);
    });

    it('rejects a wrong or missing token', () => {
        expect(isAuthorizedCronRequest(reqWith('Bearer wrong'))).toBe(false);
        expect(isAuthorizedCronRequest(reqWith())).toBe(false);
        expect(isAuthorizedCronRequest(reqWith('s3cret'))).toBe(false);
    });

    it('is exact about the Bearer scheme casing', () => {
        expect(isAuthorizedCronRequest(reqWith('bearer s3cret'))).toBe(false);
    });

    it('rejects everything when CRON_SECRET is unset or blank', () => {
        delete process.env.CRON_SECRET;
        expect(isAuthorizedCronRequest(reqWith('Bearer s3cret'))).toBe(false);
        process.env.CRON_SECRET = '   ';
        expect(isAuthorizedCronRequest(reqWith('Bearer    '))).toBe(false);
    });
});
