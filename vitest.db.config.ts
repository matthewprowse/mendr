import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Database integration tests (PGlite — embedded Postgres, no Docker).
 *
 * Kept separate from the default unit/contract run because each file spins up a
 * real Postgres and loads the Pro migrations, which is slower than the mocked
 * suite. Run with `pnpm test:db`. No coverage thresholds here — coverage is
 * measured by the main config.
 */
export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['src/**/*.db.test.ts'],
        testTimeout: 30000,
        hookTimeout: 30000,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
