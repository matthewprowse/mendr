import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest configuration upgraded to v4.
 * Uses per-file environment annotations (`@vitest-environment jsdom`) for
 * files that need jsdom; all other tests run in node.
 *
 * Previously used `environmentMatchGlobs` which was removed in vitest 4.
 * Files matching *.dom.test.tsx or in __tests__/components/ receive jsdom
 * via the `environment` option set per-file (using the @vitest-environment
 * docblock comment, or the environmentMatchGlobs replacement via
 * the `pool` + project API in workspace mode).
 *
 * To avoid adding @vitest-environment comments to every dom test file we use
 * the `project` array (workspace-lite) to split environments in one config.
 */
export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: 'node',
                    environment: 'node',
                    globals: true,
                    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
                    exclude: [
                        '**/node_modules/**',
                        '**/dist/**',
                        '**/.next/**',
                        'src/**/*.db.test.ts',
                        'src/**/*.branch.test.ts',
                        'src/**/*.dom.test.tsx',
                        'src/**/__tests__/components/**/*.test.tsx',
                    ],
                    setupFiles: ['./src/__tests__/setup-dom.ts'],
                },
                resolve: {
                    alias: {
                        '@': path.resolve(__dirname, './src'),
                    },
                },
            },
            {
                test: {
                    name: 'jsdom',
                    environment: 'jsdom',
                    globals: true,
                    include: [
                        'src/**/*.dom.test.tsx',
                        'src/**/__tests__/components/**/*.test.tsx',
                    ],
                    exclude: [
                        '**/node_modules/**',
                        '**/dist/**',
                        '**/.next/**',
                        'src/**/*.db.test.ts',
                        'src/**/*.branch.test.ts',
                    ],
                    setupFiles: ['./src/__tests__/setup-dom.ts'],
                },
                resolve: {
                    alias: {
                        '@': path.resolve(__dirname, './src'),
                    },
                },
            },
        ],
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
                // Next.js RSC framework files — not unit-testable, exercised by E2E
                'src/app/**/page.tsx',
                'src/app/**/layout.tsx',
                'src/app/**/loading.tsx',
                'src/app/**/error.tsx',
                'src/app/**/not-found.tsx',
                'src/app/robots.ts',
                'src/app/sitemap.ts',
                'src/app/global-error.tsx',
                'src/env.ts',
            ],
            // Coverage baseline post-Phase-2 upgrade (vitest v4, lucide v1, shadcn v4)
            // Measured actuals (2026-06-07): stmts 33.65%, branches 27.67%, funcs 22.36%, lines 34.86%
            // Thresholds set to floor(actual). Raise toward plan targets per future phases.
            // Actuals post-phase-8 (2026-06-07): stmts 33.86%, branches 27.83%, funcs 22.66%, lines 35.09%
            // Actuals post-audit-Phase-A (2026-06-09: +10 route contracts, proxy
            // gate, email render smoke): stmts 35.02%, branches 29.09%,
            // funcs 24.30%, lines 36.28%. Ratchet: thresholds = floor(actual).
            // Actuals post-audit-Phases-B-E (2026-06-10: lib/logging + email
            // tokens, lib/ai adapters, stateful hooks/context, component layer +
            // photo/HEIC upload flow, diagnosis accuracy eval harness):
            // stmts 37.59%, branches 31.17%, funcs 27.13%, lines 38.99%.
            // Ratchet: thresholds = floor(actual).
            // Actuals post-phase-0 (2026-06-10: exclude Next.js RSC framework files
            // from coverage denominator — 80 page/layout/loading/error files, ~6,100 lines):
            // stmts 41.94%, branches 34.39%, funcs 32.93%, lines 43.49%.
            // Ratchet: thresholds = floor(actual).
            // Actuals post-phase-9 (2026-06-10: branch coverage pass + remaining
            // shared components — contact-popover, pro-account-menu, app-header,
            // header-auth, landing-header + 9A branch additions):
            // stmts 59.68%, branches 49.52%, funcs 50.56%, lines 61.98%.
            // Ratchet: thresholds = floor(actual).
            // Actuals post-targeted-lib-pass (2026-06-10: bot-handler 70.95%->88.23%
            // branches, handler 43.19%->66.17%, provider-enrichment 16.93%->74.6%):
            // stmts 61.36%, branches 51.58%, funcs 52.12%, lines 63.72%.
            // Ratchet: thresholds = floor(actual).
            thresholds: {
                lines: 63,
                branches: 51,
                functions: 52,
                statements: 61,
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
