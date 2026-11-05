import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'src/routeTree.gen.ts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      prettier,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // The router plugin owns route exports during development.
    files: ['src/routes/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // React Hook Form's watch() and TanStack Table can't be memoised by the
    // React Compiler. That is expected, so the hint is off. The shadcn
    // carousel sets state in an effect by design.
    files: ['src/**'],
    rules: { 'react-hooks/incompatible-library': 'off' },
  },
  {
    files: ['src/components/ui/**'],
    rules: { 'react-hooks/set-state-in-effect': 'off' },
  },
]);
