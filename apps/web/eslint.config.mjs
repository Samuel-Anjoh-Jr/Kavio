import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
  {
    // The single wrapper for media we do not host. next/image cannot be used
    // there: every URL comes from an S3 bucket whose hostname is deployment
    // configuration, and an unallowlisted host throws rather than degrading.
    // The exemption is granted here, once, instead of as a comment at each of
    // the dozen call sites — and lives next to its reasoning in the component.
    files: ['components/ui/remote-image.tsx'],
    rules: { '@next/next/no-img-element': 'off' },
  },
]);

export default eslintConfig;
