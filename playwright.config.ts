/**
 * Playwright config for Mendr E2E (Phase 6 of the testing-build plan).
 *
 * Boots a production Next.js server (built via `pnpm build`, started via
 * `pnpm start`) and runs the specs in `app/e2e/` against it. The server reads
 * `.env.test` so that LLM, Places, and Brave calls are routed through the
 * mock branches in source — see `.env.test.example` for the contract.
 *
 * Two browser projects:
 *   • chromium-desktop — 1280×720
 *   • chromium-mobile  — 375×667 (iPhone-ish viewport)
 *
 * Local runs default to zero retries; CI runs retry once and capture traces
 * on the retry. Reports are written to `playwright-report/` (HTML) and
 * `test-results/` (artifacts) — both gitignored.
 */
import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

export default defineConfig({
    testDir: './e2e',
    timeout: 60_000,
    expect: { timeout: 30_000 },
    fullyParallel: true,
    forbidOnly: isCI,
    retries: isCI ? 1 : 0,
    workers: isCI ? 1 : undefined,
    reporter: [['html', { open: 'never' }], ['list']],
    use: {
        baseURL: 'http://127.0.0.1:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        {
            name: 'chromium-desktop',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1280, height: 720 },
            },
        },
        {
            name: 'chromium-mobile',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 375, height: 667 },
                isMobile: true,
                hasTouch: true,
            },
        },
    ],
    webServer: {
        command: 'pnpm build && pnpm start --port 3000',
        url: 'http://127.0.0.1:3000',
        reuseExistingServer: !isCI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
            NEXT_TELEMETRY_DISABLED: '1',
            MOCK_LLM: '1',
            MOCK_PLACES: '1',
            MOCK_BRAVE: '1',
            // Disable the beta-access gate (src/proxy.ts) so /start, /match, and
            // /contractors are directly reachable in E2E. Setting to an empty
            // string makes `process.env.COMING_SOON_PASSWORD && !isBetaPublicPath`
            // evaluate falsy.
            COMING_SOON_PASSWORD: '',
        },
    },
});
