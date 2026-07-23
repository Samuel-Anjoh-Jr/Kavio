// @ts-check
// Standalone ESLint pass (run via `pnpm lint:i18n`) that forbids hardcoded
// user-facing strings in web UI code, per SRS NFR-I18N-01 / SYS-03.
import tseslint from 'typescript-eslint';
import i18next from 'eslint-plugin-i18next';

/**
 * Source files carry `eslint-disable` comments for rules owned by the MAIN lint
 * config's plugins (`@next/next`, `react-hooks`). This pass loads only the i18n
 * plugin, so those directives would resolve to nothing and ESLint would fail
 * with "Definition for rule … was not found". Registering the rule names as
 * inert no-ops lets the directives resolve harmlessly here, while `pnpm lint`
 * still enforces the real rules — and, unlike excluding the files, it keeps
 * every product surface i18n-checked.
 */
const inertRule = { meta: { schema: [] }, create: () => ({}) };
const foreignRuleStubs = {
  '@next/next': { rules: { 'no-img-element': inertRule } },
  'react-hooks': { rules: { 'exhaustive-deps': inertRule } },
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/*.config.{js,mjs,cjs,ts}',
      '**/*.d.ts',
      // Image-generation routes: the JSX renders to a PNG/SVG (social OG card,
      // PWA splash screen), never to localized DOM. Its only literals are the
      // brand token and city proper nouns, drawn into a graphic.
      'apps/web/app/**/opengraph-image.tsx',
      'apps/web/app/**/splash/**',
      // Internal design-system reference page — not product UI, and its labels
      // ARE the design tokens they name ("Primary", "Ghost", …).
      'apps/web/app/**/styleguide/**',
    ],
  },
  {
    files: ['apps/web/app/**/*.{ts,tsx}', 'apps/web/components/**/*.{ts,tsx}'],
    linterOptions: {
      // The stubbed foreign rules above never report, so their disable comments
      // read as "unused" in this pass. They are valid in `pnpm lint`; silence
      // the noise here rather than touching the source.
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { i18next, ...foreignRuleStubs },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          // Only flag JSX text nodes, not every string literal in the file.
          mode: 'jsx-text-only',
          'jsx-attributes': {
            exclude: [
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
              'key',
              'style',
            ],
          },
          words: {
            exclude: [
              // Default numeric / punctuation-only patterns.
              '[0-9!-/:-@\\[-`{-~]+',
              // Default: all-caps identifiers (e.g. enum values used as display text).
              '[A-Z_-]+',
              // Brand token — identical in EN and FR by design (see CLAUDE.md).
              'TrustPro',
              // Honeypot decoy label: inside aria-hidden, never shown to users.
              'Website',
              // Decorative aria-hidden glyph (record button dot).
              '●',
              // Decorative numeric unit rendered aria-hidden.
              '/ 100',
              // Separator glyphs used as decorative punctuation (aria-hidden or
              // inside a larger translated string).
              '·',
              '–',
              '—',
            ],
          },
        },
      ],
    },
  },
  {
    // Root error and 404 pages render OUTSIDE the [locale] segment, so they
    // cannot reach the next-intl context and legitimately inline both languages
    // by hand ("… · …"). This is the standard Next.js pattern for these files.
    files: ['apps/web/app/not-found.tsx', 'apps/web/app/global-error.tsx'],
    rules: { 'i18next/no-literal-string': 'off' },
  },
);
