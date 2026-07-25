import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to the monorepo root explicitly. Without this,
    // Turbopack walks up from apps/web looking for a lockfile and can lock
    // onto an unrelated one outside the repo (e.g. a stray lockfile in the
    // user's home directory on Windows) — which relocates its persistent dev
    // cache outside the project and leaves it prone to corruption.
    root: path.join(__dirname, '..', '..'),
  },
};

export default withNextIntl(nextConfig);
