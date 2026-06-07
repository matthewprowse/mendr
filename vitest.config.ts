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
            ],
            // Coverage baseline post-Phase-2 upgrade (vitest v4, lucide v1, shadcn v4)
            // Measured actuals (2026-06-07): stmts 33.65%, branches 27.67%, funcs 22.36%, lines 34.86%
            // Thresholds set to floor(actual). Raise toward plan targets per future phases.
            // Actuals post-phase-8 (2026-06-07): stmts 33.86%, branches 27.83%, funcs 22.66%, lines 35.09%
            thresholds: {
                lines: 35,
                branches: 27,
                functions: 22,
                statements: 33,
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
