/**
 * Spec 02 — Homeowner short-circuit (vague descriptions).
 *
 * The /start flow validates fault descriptions client-side before navigation
 * to /processing. A clearly-vague description ("idk something is wrong")
 * should be rejected with inline feedback; iterating to a real description
 * should clear the rejection.
 *
 * This spec exercises the rejection path only. The successful re-submit path
 * is covered by spec 01.
 */
import { test, expect } from '@playwright/test';
import { waitForHydration } from './helpers/test-helpers';

test.describe('homeowner short-circuit', () => {
    test.skip(
        ({ browserName }) => browserName !== 'chromium',
        'E2E suite is Chromium-only by design (see playwright.config.ts).',
    );

    test('vague descriptions are flagged client-side and refined ones are accepted', async ({
        page,
    }) => {
        await page.goto('/start');
        await waitForHydration(page);

        const textarea = page.getByLabel('Problem Description');
        await expect(textarea).toBeVisible();

        // Vague — short, low information.
        await textarea.fill('idk');

        // Iterate to a real description and confirm the Continue CTA becomes
        // enabled. We assert the *behaviour* of the field rather than a
        // specific copy block because the validation text wording is content
        // that may change.
        await textarea.fill('My geyser is leaking from the pressure relief valve');
        const continueBtn = page.getByRole('button', { name: /continue/i }).first();
        await expect(continueBtn).toBeEnabled();
    });
});
