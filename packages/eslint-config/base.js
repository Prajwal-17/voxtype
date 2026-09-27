import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import turbo from 'eslint-plugin-turbo';

/** @type {import('eslint').Linter.Config[]} */
export const baseConfig = [
  eslint.configs.recommended,
  eslintConfigPrettier,
  {
    plugins: { turbo },
    rules: {
      'turbo/no-undeclared-env-vars': 'error',
    },
  },
  {
    ignores: ['**/dist/**', '**/target/**', '**/coverage/**'],
  },
];
