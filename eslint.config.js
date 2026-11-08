import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/src-tauri/**',
    '**/.svelte-kit/**',
    '**/generated/**',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  svelte.configs.recommended,
  prettier,
  svelte.configs.prettier,
  {
    files: ['apps/server/**', 'packages/**', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/desktop/**'],
    languageOptions: { globals: globals.browser },
  },
  {
    // TypeScript inside .svelte files and Svelte rune modules.
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
);
