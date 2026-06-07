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
            // Thresholds raised per phase-2 plan:
            //   lines: 40, branches: 70, functions: 60, statements: 40
            // If these fail, lower to actual + 2pp (measured after test run).
            thresholds: {
                lines: 40,
                branches: 70,
                functions: 60,
                statements: 40,
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
