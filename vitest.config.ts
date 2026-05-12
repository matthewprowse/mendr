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
            include: [
                'src/lib/safe-redirect.ts',
                'src/lib/admin-auth.ts',
                'src/lib/parse-diagnosis-from-model-response.ts',
                'src/lib/rate-limit.ts',
                'src/lib/parts-prices/lookup.ts',
                'src/lib/parts-prices/extract-price.ts',
                'src/lib/market-rates/brave-web-search.ts',
            ],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
