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
            // Phase 2 thresholds — locked just below the actuals after extracting
            // sibling modules from `app/api/diagnose/route.ts` and
            // `lib/providers/handler.ts` and adding parser fixtures + unit tests
            // for `agent-classify` + `agent-prose`. Phase 2 actuals:
            //   lines:      9.09
            //   branches:   64.43
            //   functions:  28.83
            //   statements: 9.09
            thresholds: {
                lines: 8,
                branches: 63,
                functions: 28,
                statements: 8,
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
