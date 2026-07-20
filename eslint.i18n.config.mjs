// @ts-check
// Standalone ESLint pass (run via `pnpm lint:i18n`) that forbids hardcoded
// user-facing strings in web UI code, per SRS NFR-I18N-01 / SYS-03.
import tseslint from 'typescript-eslint';
import i18next from 'eslint-plugin-i18next';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/*.config.{js,mjs,cjs,ts}',
      '**/*.d.ts',
    ],
  },
  {
    files: ['apps/web/app/**/*.{ts,tsx}', 'apps/web/components/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          markupOnly: true,
          ignoreAttribute: [
            'data-testid',
            'className',
            'href',
            'src',
            'type',
            'name',
            'id',
            'rel',
            'target',
            'aria-hidden',
            'variant',
            'size',
          ],
        },
      ],
    },
  },
);
