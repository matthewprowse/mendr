/**
 * Spec 03 — Contractor onboarding.
 *
 * The `/contractors` page is a public marketing surface that funnels into
 * `/contractors/network` for actual onboarding. The onboarding form lives
 * behind authentication (redirects to /contractors/auth?next=… for anyone
 * not signed in — see src/app/contractors/(portal)/network/page.tsx).
 *
 * What runs
 * ---------
 * • Public surface: load /contractors, verify the apply CTA is visible and
 *   points at /contractors/network.
 *
 * What is `.skip`'d (with reason)
 * --------------------------------
 * The full apply → pending → admin-approve → live cycle depends on
 * Phase 5's local Supabase being available so we can create an auth user
 * and an admin user. Without that, the onboarding form is unreachable.
 */
import { test, expect } from '@playwright/test';
import { waitForHydration } from './helpers/test-helpers';

test.describe('contractor onboarding', () => {
    test.skip(
        ({ browserName }) => browserName !== 'chromium',
        'E2E suite is Chromium-only by design (see playwright.config.ts).',
    );

    test('public /contractors page exposes an apply CTA', async ({ page }) => {
        await page.goto('/contractors');
        await waitForHydration(page);

        // There are multiple apply CTAs on the page (header, hero, FAQ). We
        // confirm at least one is visible and links to /contractors/network.
        const applyLinks = page.locator('a[href="/contractors/network"]');
        await expect(applyLinks.first()).toBeVisible();
    });

    // SKIPPED — needs Supabase auth (Phase 5 infra) to sign up the
    // applicant, fill the multi-step form, submit, then sign in as an admin
    // to approve the application. Without a real Supabase test DB this
    // test cannot run meaningfully; stubbing the entire auth + provider
    // approval surface in a single spec would be more flake than signal.
    test.skip('apply → pending → admin-approve → live', async ({ page }) => {
        await page.goto('/contractors/network');
        expect(page.url()).toContain('/contractors');
    });
});
