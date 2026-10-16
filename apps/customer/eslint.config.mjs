import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/**
 * ESLint flat config for the ORYX customer app.
 *
 * `next lint` is deprecated in Next 15 and prompts interactively when no config
 * exists, which made `pnpm -r lint` hang in CI. Linting now runs `eslint`
 * directly against this config, so it is deterministic and non-interactive.
 */
const config = [
  { ignores: ['.next/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // The apps fetch from a typed API client; `any` is confined to that layer
      // and surfaced by the API DTOs instead.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Next generates this file; the triple-slash reference is theirs, not ours.
    files: ['next-env.d.ts'],
    rules: { '@typescript-eslint/triple-slash-reference': 'off' },
  },
];

export default config;
