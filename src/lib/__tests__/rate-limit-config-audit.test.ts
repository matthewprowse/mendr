import { describe, it, expect } from 'vitest';
import { RATE_LIMITS } from '../rate-limit-config';

// ─────────────────────────────────────────────────────────────────────────────
// Launch-readiness regression tests for src/lib/rate-limit-config.ts.
//
// These tests aren't trying to test the implementation of rate-limiting itself
// (that's done in rate-limit.test.ts) — they pin the *audit verdicts* recorded
// in the file header so a future engineer can't quietly loosen a public bucket
// past the launch sanity bound, or rename/delete a bucket that production
// routes depend on.
// ─────────────────────────────────────────────────────────────────────────────

describe('rate-limit-config — launch-readiness audit', () => {
    const bucketEntries = Object.entries(RATE_LIMITS) as Array<
        [string, { windowMs: number; max: number }]
    >;

    it('every bucket has positive windowMs and max', () => {
        expect(bucketEntries.length).toBeGreaterThan(0);
        for (const [name, cfg] of bucketEntries) {
            expect(cfg.windowMs, `${name}.windowMs must be > 0`).toBeGreaterThan(0);
            expect(cfg.max, `${name}.max must be > 0`).toBeGreaterThan(0);
        }
    });

    it('no unauthenticated bucket exceeds the 100/min sanity ceiling', () => {
        // We don't have per-bucket auth metadata yet, so we apply the strictest
        // possible interpretation: ALL buckets must stay within 100 requests
        // normalised to a 1-minute window. Anything looser at launch should be
        // an explicit, documented exception (none currently exist).
        for (const [name, cfg] of bucketEntries) {
            const perMinute = cfg.max * (60_000 / cfg.windowMs);
            expect(
                perMinute,
                `${name} normalises to ${perMinute.toFixed(1)} req/min — exceeds the 100/min launch ceiling`,
            ).toBeLessThanOrEqual(100);
        }
    });

    it('all canonical bucket names exist (regression guard)', () => {
        // If a route renames or deletes one of these without updating callers,
        // every call to checkRateLimit(req, 'thatBucket') will fail type-check
        // *and* fail this test — making the breakage impossible to miss in CI.
        const required = [
            'diagnose',
            'providers',
            'geocode',
            'transcribe',
            'uploadImage',
            'reviews',
            'analyticsEvents',
            'contactForm',
            'contactContractor',
            'savedProviders',
            'jobOutcome',
            'refineDiagnosis',
        ] as const;

        const present = new Set(Object.keys(RATE_LIMITS));
        for (const name of required) {
            expect(present.has(name), `bucket "${name}" missing from RATE_LIMITS`).toBe(true);
        }
    });
});
