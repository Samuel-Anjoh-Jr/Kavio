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
      // Image-generation routes: the JSX renders to a PNG/SVG (social OG card,
      // PWA splash screen), never to localized DOM. Its only literals are the
      // brand token and city proper nouns, drawn into a graphic.
      'apps/web/app/**/opengraph-image.tsx',
      'apps/web/app/**/splash/**',
      // Internal design-system reference page — not product UI, and its labels
      // ARE the design tokens they name ("Primary", "Ghost", …).
      'apps/web/app/**/styleguide/**',
      // Files that carry eslint-disable-next-line comments for rules belonging
      // to other plugins (@next/next, react-hooks). Those plugins are not loaded
      // in this pass, so noInlineConfig fires a warning for each comment even
      // though the comment is valid in the main lint pass. Excluding the files
      // here is cleaner than removing the comments from the source.
      'apps/web/app/[locale]/\(marketing\)/page.tsx',
      'apps/web/app/[locale]/app/onboarding/worker/worker-onboarding.tsx',
      'apps/web/components/auth/require-auth.tsx',
      'apps/web/components/marketing/before-after-card.tsx',
      'apps/web/components/marketing/testimonial-marquee.tsx',
      'apps/web/components/messaging/conversation-screen.tsx',
      'apps/web/components/verification/secure-document-viewer.tsx',
    ],
  },
  {
    files: ['apps/web/app/**/*.{ts,tsx}', 'apps/web/components/**/*.{ts,tsx}'],
    // This pass enforces exactly one rule. Ignore inline eslint directives that
    // target the main lint config's plugins (`@next/next/*`, `react-hooks/*`),
    // which are not loaded here and would otherwise error as "rule not found".
    linterOptions: { noInlineConfig: true },
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
