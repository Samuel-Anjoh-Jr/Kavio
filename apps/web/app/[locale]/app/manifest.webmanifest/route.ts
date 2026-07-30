import { NextResponse } from 'next/server';
import { hasLocale } from 'next-intl';
import { routing, type Locale } from '@/i18n/routing';

/**
 * Hand-written Route Handler (not the `manifest.ts` file convention) so the
 * manifest can vary per locale via the `[locale]` segment's params — the
 * file-convention export doesn't reliably receive dynamic-segment params.
 * Scope + start_url are pinned to `/{locale}/app/`, keeping the marketing
 * landing page outside the installable app (CLAUDE.md ACCESS MODEL).
 */

const COPY: Record<Locale, { name: string; description: string }> = {
  en: {
    name: 'Kavio',
    description: 'Find verified, trusted workers for local services across Cameroon.',
  },
  fr: {
    name: 'Kavio',
    description:
      'Trouvez des travailleurs vérifiés et fiables pour des services locaux partout au Cameroun.',
  },
};

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale;
  const copy = COPY[locale];
  const basePath = `/${locale}/app`;

  const manifest = {
    id: basePath,
    name: copy.name,
    short_name: copy.name,
    description: copy.description,
    lang: locale,
    dir: 'ltr',
    start_url: `${basePath}?source=pwa`,
    scope: `${basePath}/`,
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f8f9fc',
    theme_color: '#3d5afe',
    icons: [
      { src: `${basePath}/icons/192`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${basePath}/icons/512`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: `${basePath}/icons/512-maskable`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
}
