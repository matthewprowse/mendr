/**
 * Contract test for POST /api/providers.
 *
 * The route re-exports POST from `@/lib/providers/handler`. The handler itself
 * is covered by the Phase 2 integration tests under
 * `src/lib/providers/__tests__/handler.integration.test.ts`. This file is a
 * minimal smoke check confirming the route exports a POST handler.
 */
import { describe, it, expect } from 'vitest';

describe('/api/providers route export', () => {
    it('re-exports a POST handler', async () => {
        const mod = await import('./route');
        expect(typeof mod.POST).toBe('function');
    });
});
