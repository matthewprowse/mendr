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
        // DB integration tests (PGlite) run via their own config (`pnpm test:db`)
        // since each spins up a real Postgres — excluded from the fast default run.
        exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'src/**/*.db.test.ts', 'src/**/*.branch.test.ts'],
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
            // Thresholds ratcheted to current actuals minus ~1pp, floored at the
            // previous thresholds so we never lower the bar in CI.
            //
            // Post-T5 actuals (2144 tests across 220 files, measured in an
            // isolated worktree off origin/main so the suite runs clean):
            //   lines:      27.70
            //   branches:   68.28
            //   functions:  54.74
            //   statements: 27.70
            //
            // Applied thresholds (max(prev-threshold, floor(actual)-1)):
            //   lines:      26   (max(19, floor(27.70)-1=26))  ← up from 19
            //   branches:   67   (max(65, floor(68.28)-1=67))  ← up from 65
            //   functions:  53   (max(47, floor(54.74)-1=53))  ← up from 47
            //   statements: 26   (max(19, floor(27.70)-1=26))  ← up from 19
            //
            // The ~1pp margin also absorbs the small drift between this branch and
            // main (main carries a few more tests from a parallel workstream, so
            // its coverage is >= these figures — these remain a safe floor there).
            //
            // Phase 5 (Supabase integration tests) is still deferred — needs a real
            // Postgres. Once it ships, lines/statements should jump materially
            // (most uncovered code is server route handlers exercised only via
            // mocked contract tests today).
            thresholds: {
                lines: 26,
                branches: 67,
                functions: 53,
                statements: 26,
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
