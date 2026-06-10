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
      // Aspirational quality rules — kept as 'warn' (visible, tracked) rather than
      // 'error' so they don't block CI on the large body of pre-existing violations
      // surfaced by the Phase-4 ESLint 10 + typescript-eslint + Next 16 React Compiler
      // upgrade. Tighten to 'error' incrementally as each category is cleaned up.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': ['warn', { allowExpressions: true, allowHigherOrderFunctions: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'warn',
      // React Compiler / react-hooks rules bundled in eslint-config-next@16 — the
      // codebase has pre-existing violations; track as warnings until addressed.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/incompatible-library': 'warn',
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
