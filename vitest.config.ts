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
            // Phase 1 thresholds — locked just below current actuals after
            // adding pure-function unit tests for providers/relevance,
            // providers/open-status, rate-limit, diagnosis/start-description-quality,
            // whatsapp-message-validate, providers/review-normalization,
            // providers/review-ingestion, and email/utils. Note: lines/statements
            // remain low because the coverage scope was widened to `src/**/*`
            // in Phase 0 and most route handlers / client components are still
            // untested; later phases will lift these to the planned 35/30/35/35.
            thresholds: {
                lines: 5,
                branches: 30,
                functions: 19,
                statements: 5,
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
