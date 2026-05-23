import eslintConfigNext from 'eslint-config-next';

const config = [
    {
        // Ignore build artefacts, coverage reports, and IDE/tool caches so
        // `pnpm lint` doesn't bleed warnings from generated files.
        ignores: [
            '.next/**',
            'coverage/**',
            'playwright-report/**',
            'test-results/**',
            '**/.cache/**',
            'node_modules/**',
        ],
    },
    ...eslintConfigNext,
];
export default config;
