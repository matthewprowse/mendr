/**
 * Marker / smoke test for /api/diagnose.
 *
 * The full contract for this route is exercised by the Phase 2 integration
 * tests in `src/app/api/diagnose/__tests__/route.integration.test.ts` —
 * those cover auth, validation, rate-limit, happy path, and pipeline
 * invariants end-to-end. This file pins that the module still exports a
 * POST handler.
 */
import { describe, it, expect } from 'vitest';

describe('/api/diagnose route module', () => {
    it('exports a POST handler', async () => {
        const mod = await import('./route');
        expect(typeof mod.POST).toBe('function');
    });
});
