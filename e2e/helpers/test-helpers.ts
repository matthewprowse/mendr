/**
 * Shared E2E helpers.
 *
 * Centralises the few utility functions used across specs so individual
 * spec files stay readable. Anything more sophisticated (page-object models,
 * auth fixtures, factory builders) should live in dedicated files alongside.
 */
import type { Page } from '@playwright/test';

/**
 * Wait for the Next.js client hydration heuristic — root element exists and
 * the page has finished any first-paint network work. Cheap, deterministic.
 */
export async function waitForHydration(page: Page): Promise<void> {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
        // Some Mendr pages keep long-poll requests open (analytics, etc.).
        // domcontentloaded is the meaningful gate; networkidle is best-effort.
    });
}

/**
 * Generate a unique-per-test-run email address. Used by auth specs so each
 * run does not collide with stale rows in the Supabase auth table.
 */
export function uniqueEmail(prefix = 'e2e'): string {
    const slug = Math.random().toString(36).slice(2, 8);
    const stamp = Date.now().toString(36);
    return `${prefix}+${stamp}-${slug}@example.test`;
}
