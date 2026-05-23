import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest configuration with two test "projects" expressed via
 * `environmentMatchGlobs`. The Vitest workspace feature is the more idiomatic
 * way to express this in newer versions, but `environmentMatchGlobs` is
 * supported in 2.x and avoids a separate workspace file.
 *
 *  • Node env — server-side unit + contract tests (`*.test.ts(x)` except DOM).
 *  • jsdom env — React component + form behavior tests
 *    (`*.dom.test.tsx` or files under `__tests__/components/`).
 *
 * The jsdom setup file boots an MSW server with default handlers and adds
 * jest-dom matchers.
 */
export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.dom.test.tsx'],
        environmentMatchGlobs: [
            ['src/**/*.dom.test.tsx', 'jsdom'],
            ['src/**/__tests__/components/**/*.test.tsx', 'jsdom'],
        ],
        setupFiles: ['./src/__tests__/setup-dom.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                'src/**/*.test.{ts,tsx}',
                'src/**/__tests__/**',
                'src/components/ui/**',
                'src/**/*.d.ts',
                'node_modules',
                '.next',
            ],
            // Phase 4 thresholds — ratcheted to current actuals minus a small
            // margin after adding Testing Library + MSW component tests for
            // contact-form, auth-card, homeowner-auth-dialog, the
            // coming-soon contact/beta-access forms, the match filter-sheet,
            // and the contractor application's first-two-step navigation.
            // Phase 4 actuals (post-add):
            //   lines:      19.76
            //   branches:   66.28
            //   functions:  47.48
            //   statements: 19.76
            // (Lines/statements lift slowly because most src/* is server-side
            // libs and routes — component tests primarily move *functions*.
            // The contractor onboarding page is 2285 lines and only Steps 1-2
            // are exercised here; the rest is gated behind file uploads and
            // Google Maps and is deferred to Phase 6 E2E.)
            thresholds: {
                lines: 18,
                branches: 65,
                functions: 46,
                statements: 18,
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
