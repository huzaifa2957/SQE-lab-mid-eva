import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/release/**', '**/node_modules/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // packages/core: pure logic, no `any` (NF-05)
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // apps/web: React rules + SR-03
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true, allowExportNames: ['useProjects', 'useTheme', 'useToast'] },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'SR-03: dangerouslySetInnerHTML is not allowed.',
        },
      ],
    },
  },

  // Node code: AI proxy, Electron main process and scripts, shared platform package
  {
    files: ['apps/ai-proxy/**/*.ts', 'apps/desktop/**/*.{ts,mjs}', 'packages/platform/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // Tooling/config files run in Node
  {
    files: ['*.{js,ts}', '**/*.config.{js,ts}', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },

  prettier,
);
