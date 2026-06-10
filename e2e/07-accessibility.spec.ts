/**
 * Spec 07 — Accessibility regression gate on the public funnel (audit Phase E2).
 *
 * Runs axe-core (WCAG 2.0/2.1 A + AA) against the unauthenticated pages a
 * homeowner hits before sign-in and gates on `critical` + `serious` impact —
 * the actionable, regression-worthy violations.
 *
 * Existing debt is BASELINED per page (KNOWN_VIOLATIONS) rather than hidden:
 * the gate fails only on a critical/serious rule that is NOT already on the
 * baseline, so it catches new regressions while the documented pre-existing
 * issues are tracked for follow-up. Tighten a page by deleting its rule ids
 * from the baseline once they're fixed.
 *
 * Pre-existing debt recorded 2026-06-10 (audit Phase E2):
 *   • /start        — `label` (1 control without an accessible name)
 *   • /contractors  — `color-contrast` (11 low-contrast text nodes)
 *   • /contact      — clean
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitForHydration } from './helpers/test-helpers';

const BLOCKING_IMPACTS = new Set(['critical', 'serious']);

/** Rule ids with known, pre-existing critical/serious violations per page. */
const KNOWN_VIOLATIONS: Record<string, string[]> = {
    '/start': ['label'],
    '/contact': [],
    '/contractors': ['color-contrast'],
};

const PUBLIC_PAGES: Array<{ name: string; path: string }> = [
    { name: 'start', path: '/start' },
    { name: 'contact', path: '/contact' },
    { name: 'contractors', path: '/contractors' },
];

test.describe('accessibility — public funnel', () => {
    test.skip(
        ({ browserName }) => browserName !== 'chromium',
        'E2E suite is Chromium-only by design (see playwright.config.ts).',
    );

    for (const { name, path } of PUBLIC_PAGES) {
        test(`${name} introduces no new critical/serious WCAG violations`, async ({ page }) => {
            await page.goto(path);
            await waitForHydration(page);

            const results = await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
                .analyze();

            const baseline = new Set(KNOWN_VIOLATIONS[path] ?? []);
            const regressions = results.violations.filter(
                (v) => v.impact && BLOCKING_IMPACTS.has(v.impact) && !baseline.has(v.id),
            );

            // Surface everything for awareness; only NEW serious/critical fail.
            if (results.violations.length > 0) {
                console.log(
                    `[a11y:${name}] ${results.violations.length} violation(s):`,
                    results.violations
                        .map((v) => `${v.impact}:${v.id} (${v.nodes.length})`)
                        .join(', '),
                );
            }

            expect(
                regressions.map((v) => ({ id: v.id, impact: v.impact, help: v.help })),
                `New (non-baselined) critical/serious a11y violations on ${path}`,
            ).toEqual([]);
        });
    }
});
