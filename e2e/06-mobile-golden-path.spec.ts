/**
 * Spec 06 — Homeowner golden path at mobile viewport.
 *
 * Mirrors spec 01 but only runs in the `chromium-mobile` project (375×667).
 * This catches mobile-specific regressions on /start — the FlowTopBar, the
 * Textarea, the location step, and the Continue CTA all have distinct
 * mobile-only styling and tap targets.
 *
 * Like spec 01, the deterministic boundary is /processing (a client-side
 * router.push, no DB). The /processing → /report → /match leg persists and
 * reads the diagnosis, so it runs in the nightly Supabase-branch workflow, not
 * here. (The previously-cited build failure in contents-builder.ts is resolved.)
 */
import { test, expect } from '@playwright/test';
import { waitForHydration } from './helpers/test-helpers';

const CAPE_TOWN = { latitude: -33.9249, longitude: 18.4241 };
const STUB_ADDRESS = '12 Main Road, Sea Point, Cape Town';

test.describe('homeowner golden path (mobile)', () => {
    test.skip(({ viewport }) => {
        // Only run this spec in the mobile project; skip in chromium-desktop.
        return !viewport || viewport.width > 500;
    }, 'mobile-only spec — chromium-mobile project handles this');

    test('renders /start and accepts a fault description at mobile size', async ({ page }) => {
        await page.goto('/start');
        await waitForHydration(page);

        const textarea = page.getByLabel('Problem Description');
        await expect(textarea).toBeVisible();
        await textarea.fill('My geyser is leaking from the relief valve');

        const continueBtn = page.getByRole('button', { name: /continue/i }).first();
        await expect(continueBtn).toBeVisible();
        await expect(continueBtn).toBeEnabled();
    });

    test('full flow at mobile size: describe → locate → submit → /processing', async ({
        page,
        context,
    }) => {
        await context.grantPermissions(['geolocation']);
        await context.setGeolocation(CAPE_TOWN);
        await page.route('**/api/geocode', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ address: STUB_ADDRESS }),
            }),
        );

        await page.goto('/start');
        await waitForHydration(page);

        await page
            .getByLabel('Problem Description')
            .fill('My geyser is leaking from the pressure relief valve');
        await page.getByRole('button', { name: /continue/i }).first().click();

        const useMyLocation = page.getByRole('button', { name: /use my location/i });
        await expect(useMyLocation).toBeVisible();
        await useMyLocation.click();

        const submit = page.getByRole('button', { name: /^continue$/i });
        await expect(submit).toBeEnabled();
        await submit.click();

        await page.waitForURL(/\/processing\/[^/?]+\?.*location=/, { timeout: 30_000 });
        expect(page.url()).toContain('/processing/');
    });
});
