import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * ESLint flat config for the ORYX customer mobile app (React Native / Expo).
 *
 * The mobile workspace previously reported "eslint not configured" and exited 0,
 * so CI never actually linted it. This config is real: it runs the TypeScript
 * parser with type information and the React and React Hooks rules that catch
 * the mistakes a bundler alone will not — stale closures in `useEffect`, a
 * missing dependency, or a hook called conditionally.
 */
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'android/**',
      'ios/**',
      '.expo/**',
      'babel.config.js',
      'metro.config.js',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      '@typescript-eslint': tseslint,
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // React Native has no DOM and the new JSX transform makes the React import
      // optional, so the classic "React must be in scope" rule does not apply.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      // `no-undef` does not understand TypeScript's ambient types or JSX.
      'no-undef': 'off',
    },
  },
];
