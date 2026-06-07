import eslintConfigNext from 'eslint-config-next';
import tseslint from 'typescript-eslint';

// eslint-plugin-react@7.x uses context.getFilename() which was removed in ESLint 10.
// Disable all react/* rules until eslint-plugin-react ships ESLint 10 compat.
// The JSX transform + Next.js compile pipeline still catches React misuse at build time.
const reactEslint10Compat = {
  rules: Object.fromEntries(
    eslintConfigNext
      .flatMap((c) => Object.keys(c.rules ?? {}))
      .filter((r) => r.startsWith('react/'))
      .map((r) => [r, 'off']),
  ),
};

const config = [
  {
    ignores: [
      '.next/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '**/.cache/**',
      'node_modules/**',
      'scripts/**',
      'emails/**',
    ],
  },
  ...eslintConfigNext,
  reactEslint10Compat,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Set to 'warn' until existing any usages are addressed incrementally
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': ['warn', { allowExpressions: true, allowHigherOrderFunctions: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'error',
    },
  },
  // Relax rules for test files — console output is intentional in tests
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**', '**/e2e/**', 'src/__tests__/**'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
export default config;
