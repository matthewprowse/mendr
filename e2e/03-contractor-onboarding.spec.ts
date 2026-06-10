/**
 * Spec 03 — Contractor (Pro) onboarding.
 *
 * After the contractors→pro migration the public marketing surface lives at
 * `/pro` (the legacy `/contractors` path 301s there) and funnels into
 * `/pro/network` for actual onboarding. The onboarding form sits behind auth
 * (anyone not signed in is redirected to the pro auth screen).
 *
 * What runs
 * ---------
 * • Public surface: load /pro, verify the apply CTA is visible and points at
 *   /pro/network.
 *
 * What is `.skip`'d (with reason)
 * --------------------------------
 * The full apply → pending → admin-approve → live cycle needs a real Supabase
 * branch (auth user + admin user). It runs in the NIGHTLY integration tier, not
 * per-PR — stubbing the entire auth + approval surface in one spec would be more
 * flake than signal.
 */
import { test, expect } from '@playwright/test';
import { waitForHydration } from './helpers/test-helpers';

test.describe('contractor onboarding', () => {
    test.skip(
        ({ browserName }) => browserName !== 'chromium',
        'E2E suite is Chromium-only by design (see playwright.config.ts).',
    );

    test('public /pro page exposes an apply CTA', async ({ page }) => {
        await page.goto('/pro');
        await waitForHydration(page);

        // Multiple apply CTAs exist (hero, sticky bar, FAQ). Confirm at least
        // one is visible and links to the onboarding entry point.
        const applyLinks = page.locator('a[href="/pro/network"]');
        await expect(applyLinks.first()).toBeVisible();
    });

    test('legacy /contractors redirects to the /pro surface', async ({ page }) => {
        await page.goto('/contractors');
        await waitForHydration(page);
        expect(new URL(page.url()).pathname).toBe('/pro');
    });

    // SKIPPED — needs a Supabase branch (Phase 5 infra) to sign up the
    // applicant, fill the multi-step form, submit, then sign in as an admin to
    // approve. Runs in the nightly integration workflow. See audit Phase D.
    test.skip('apply → pending → admin-approve → live', async ({ page }) => {
        await page.goto('/pro/network');
        expect(page.url()).toContain('/pro');
    });
});
