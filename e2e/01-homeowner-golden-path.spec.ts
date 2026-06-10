/**
 * Spec 01 — Homeowner golden path (desktop).
 *
 * Walks the public-facing happy path through the two-step /start flow:
 *   /start → describe a fault → Continue → location step → submit → /processing
 *
 * Scope / determinism
 * -------------------
 * The webServer (playwright.config.ts) runs with MOCK_LLM=1 / MOCK_PLACES=1 so
 * the diagnosis pipeline returns a deterministic Plumbing/geyser fixture. Two
 * external surfaces are stubbed at the network boundary so this spec needs no
 * real keys:
 *   • Geolocation — granted via the browser context with a fixed Cape Town
 *     coordinate, so "Use My Location" resolves instantly.
 *   • POST /api/geocode — NOT covered by MOCK_PLACES (it calls Google directly),
 *     so it is stubbed to return a Western Cape address.
 *
 * The submit handler (`buildAndNavigate`) is a client-side router.push to
 * /processing — no database write — so asserting we reach /processing/<id> is
 * deterministic without Supabase. The /processing → /report → /match leg DOES
 * persist and read the diagnosis, so it requires a real Supabase branch and is
 * exercised by the NIGHTLY integration workflow, not this per-PR spec.
 */
import { test, expect } from '@playwright/test';
import { waitForHydration } from './helpers/test-helpers';

const CAPE_TOWN = { latitude: -33.9249, longitude: 18.4241 };
const STUB_ADDRESS = '12 Main Road, Sea Point, Cape Town';

test.describe('homeowner golden path (desktop)', () => {
    test.skip(
        ({ browserName }) => browserName !== 'chromium',
        'E2E suite is Chromium-only by design (see playwright.config.ts).',
    );

    test('renders /start with a fault description field', async ({ page }) => {
        await page.goto('/start');
        await waitForHydration(page);

        const textarea = page.getByLabel('Problem Description');
        await expect(textarea).toBeVisible();
    });

    test('accepts a fault description and enables Continue', async ({ page }) => {
        await page.goto('/start');
        await waitForHydration(page);

        const textarea = page.getByLabel('Problem Description');
        await textarea.fill('My geyser is leaking from the relief valve');

        const continueBtn = page.getByRole('button', { name: /continue/i }).first();
        await expect(continueBtn).toBeVisible();
        await expect(continueBtn).toBeEnabled();
    });

    test('full flow: describe → locate → submit → /processing', async ({ page, context }) => {
        // Stub the two external surfaces this leg depends on.
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

        // Step 1 — describe the fault, then Continue to the location step.
        await page
            .getByLabel('Problem Description')
            .fill('My geyser is leaking from the pressure relief valve');
        await page.getByRole('button', { name: /continue/i }).first().click();

        // Step 2 — resolve location via the granted GPS + stubbed geocode.
        const useMyLocation = page.getByRole('button', { name: /use my location/i });
        await expect(useMyLocation).toBeVisible();
        await useMyLocation.click();

        // Once a location resolves, the submit CTA enables. Click it and assert
        // the client navigates into the processing route with the id + location.
        const submit = page.getByRole('button', { name: /^continue$/i });
        await expect(submit).toBeEnabled();
        await submit.click();

        await page.waitForURL(/\/processing\/[^/?]+\?.*location=/, { timeout: 30_000 });
        expect(page.url()).toContain('/processing/');
    });
});
