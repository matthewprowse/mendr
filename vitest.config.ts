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
            // Phase 0 baseline thresholds — pinned just below current actuals
            // measured after widening the coverage scope to `src/**/*`. Phase 1
            // ratchets these upward as pure-function tests are added.
            thresholds: {
                lines: 3,
                branches: 15,
                functions: 14,
                statements: 3,
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
