import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { baseConfig } from './base.js';

/**
 * Type-aware React configuration for internal packages and applications.
 *
 * @param {{ tsconfigRootDir: string }} options
 * @returns {import('eslint').Linter.Config[]}
 */
export function createReactConfig({ tsconfigRootDir }) {
  return tseslint.config(
    {
      ignores: [
        '**/node_modules/**',
        '**/dist/**',
        '**/target/**',
        '**/coverage/**',
        '**/test-results/**',
        '**/playwright-report/**',
        'src-tauri/gen/**',
      ],
    },
    ...baseConfig,
    ...tseslint.configs.recommendedTypeChecked.map((config) => ({
      ...config,
      files: ['**/*.{ts,tsx}'],
    })),
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: {
        globals: globals.browser,
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      plugins: {
        'react-hooks': reactHooks,
        'react-refresh': reactRefresh,
      },
      rules: {
        ...reactHooks.configs.flat.recommended.rules,
        'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      },
    },
    {
      files: ['**/*.config.ts', '**/tests/**/*.{ts,tsx}'],
      languageOptions: {
        globals: { ...globals.node, ...globals.browser },
      },
    },
    {
      files: ['src/main.tsx'],
      rules: {
        'react-refresh/only-export-components': 'off',
      },
    },
  );
}
