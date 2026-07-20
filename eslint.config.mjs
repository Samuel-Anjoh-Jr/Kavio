// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['apps/**', 'packages/**', 'node_modules/**', '.turbo/**'],
  },
  eslint.configs.recommended,
  {
    files: ['*.{js,mjs,cjs}', 'scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
