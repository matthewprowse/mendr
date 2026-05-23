/**
 * Spec 04 — Authenticated homeowner: saved providers persist across sign-out.
 *
 * SKIPPED in full.
 *
 * Reason
 * ------
 * This test inherently requires real Supabase auth:
 *   1. Sign up a unique homeowner email via /api/auth (Supabase).
 *   2. Save a provider via /api/saved-providers (RLS-gated).
 *   3. Sign out, sign back in.
 *   4. Verify the saved provider survived the round trip.
 *
 * Phase 5 (Supabase integration tests with `seed.test.sql` and a local CLI
 * stack) was deferred for this audit because Docker isn't installed on the
 * dev machine. Without a local Supabase, this spec cannot reach the auth
 * tables; without a sandbox Supabase project pointed at via .env.test, it
 * cannot run in CI either.
 *
 * To enable
 * ---------
 *   1. Run a local Supabase stack OR provision a sandbox project.
 *   2. Populate app/.env.test with NEXT_PUBLIC_SUPABASE_URL,
 *      NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 *   3. Remove the .skip from the test() call below.
 *   4. Replace the placeholder body with the actual auth + save + sign-out
 *      + sign-in + assert flow (helpers/test-helpers.ts has `uniqueEmail`).
 */
import { test, expect } from '@playwright/test';
import { uniqueEmail } from './helpers/test-helpers';

test.describe('homeowner auth + saved providers', () => {
    test.skip(
        true,
        'Requires Phase 5 Supabase infrastructure — see file header for enable steps.',
    );

    test('signs up, saves a provider, signs back in, sees it persisted', async ({ page }) => {
        const email = uniqueEmail('homeowner');
        await page.goto('/');
        // body intentionally minimal — entire test is skipped above.
        expect(email).toMatch(/@example\.test$/);
    });
});
