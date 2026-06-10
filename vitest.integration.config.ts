import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Branch integration tests — run the DB suite against a REAL Postgres (a Supabase
 * branch) via SUPABASE_DB_URL. Separate from the default run; the tests skip
 * themselves when SUPABASE_DB_URL is unset.
 *
 *   SUPABASE_DB_URL='postgresql://postgres:[PWD]@db.<branch-ref>.supabase.co:5432/postgres' \
 *     pnpm test:integration
 */
export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['src/**/*.branch.test.ts'],
        testTimeout: 60000,
        hookTimeout: 60000,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
