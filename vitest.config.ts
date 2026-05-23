import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
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
            // Phase 3 thresholds — locked just below the actuals after adding
            // contract tests for every `src/app/api/**/route.ts`, a shared
            // Zod validation helper (`src/lib/api/validation.ts`), and a
            // route-test toolkit (`src/__tests__/helpers/route-test.ts`).
            // Phase 3 actuals (post-add):
            //   lines:      16.61
            //   branches:   65.56
            //   functions:  45.74
            //   statements: 16.61
            // (Lines/statements grow more slowly than functions because route
            // handlers exercise wide call graphs into provider/enrichment libs
            // that are mocked at the module boundary — those libs remain
            // uncovered until Phase 5 brings real DB integration tests.)
            thresholds: {
                lines: 15,
                branches: 64,
                functions: 44,
                statements: 15,
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
