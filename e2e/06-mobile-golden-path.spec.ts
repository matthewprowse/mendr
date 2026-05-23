/**
 * Spec 06 — Homeowner golden path at mobile viewport.
 *
 * Mirrors spec 01 but only runs in the `chromium-mobile` project (375×667).
 * This catches mobile-specific regressions on /start — the FlowTopBar, the
 * Textarea, and the Continue CTA all have distinct mobile-only styling and
 * tap targets.
 *
 * Like spec 01, the deep happy path (submit → /processing → /report →
 * /match) is `.skip`'d because it depends on Google Maps geocoding and a
 * green production build (see Phase 6 report for the pre-existing build
 * failure in src/app/api/diagnose/contents-builder.ts).
 */
import { test, expect } from '@playwright/test';
import { waitForHydration } from './helpers/test-helpers';

test.describe('homeowner golden path (mobile)', () => {
    test.skip(({ viewport }) => {
        // Only run this spec in the mobile project; skip in chromium-desktop.
        return !viewport || viewport.width > 500;
    }, 'mobile-only spec — chromium-mobile project handles this');

    test('renders /start and accepts a fault description at mobile size', async ({ page }) => {
        await page.goto('/start');
        await waitForHydration(page);

        const textarea = page.getByPlaceholder(/garage door won't open|spring on the left/i);
        await expect(textarea).toBeVisible();
        await textarea.fill('My geyser is leaking from the relief valve');

        const continueBtn = page.getByRole('button', { name: /continue/i }).first();
        await expect(continueBtn).toBeVisible();
        await expect(continueBtn).toBeEnabled();
    });
});
