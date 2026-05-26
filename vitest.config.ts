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
            // Phase 7 final thresholds — ratcheted to current actuals minus ~1pp,
            // floored at previous thresholds so we never lower the bar in CI.
            //
            // Phase 7 final actuals (1522 tests across 144 files):
            //   lines:      20.78
            //   branches:   66.42
            //   functions:  48.18
            //   statements: 20.78
            //
            // Applied thresholds (max(prev-threshold, floor(actual)-1)):
            //   lines:      19   (max(19, floor(20.78)-1=19))
            //   branches:   65   (max(65, floor(66.42)-1=65))
            //   functions:  47   (max(46, floor(48.18)-1=47))  ← up from 46
            //   statements: 19   (max(19, floor(20.78)-1=19))
            //
            // Phase 5 (Supabase integration tests) was deferred — Docker is
            // not installed locally. Once it ships, lines/statements should
            // jump materially (most uncovered code is server route handlers
            // currently exercised only via mocked contract tests).
            thresholds: {
                lines: 19,
                branches: 65,
                functions: 47,
                statements: 19,
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
