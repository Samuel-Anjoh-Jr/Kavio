import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { COUNTRY } from '@/lib/site-config';

// public/brand/kavio-mark.png is 480x369 (source: cropped transparent mark).
const MARK_ASPECT_RATIO = 480 / 369;
const MARK_HEIGHT = 64;
const MARK_DATA_URI = `data:image/png;base64,${readFileSync(
  path.join(process.cwd(), 'public/brand/kavio-mark.png'),
).toString('base64')}`;

/**
 * The default social-preview image, per locale (SYS-05, SRS §26.6).
 *
 * Generated with `next/og` rather than a checked-in binary, for the same reason
 * as the PWA icons: one source of truth for the brand mark, and it stays correct
 * when the wordmark or colours change. Individual routes (a worker profile)
 * override this with their own; this is the fallback every public route inherits
 * so none ships without one — the OG image is one of the four things the
 * metadata integrity check asserts.
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function OpengraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Marketing.meta' });

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 80,
        background: 'linear-gradient(135deg, #1b1e2e 0%, #2e324b 100%)',
        color: '#f8f9fc',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <img
          src={MARK_DATA_URI}
          width={Math.round(MARK_HEIGHT * MARK_ASPECT_RATIO)}
          height={MARK_HEIGHT}
          alt=""
        />
        <span style={{ fontSize: 40, fontWeight: 600 }}>Kavio</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span style={{ fontSize: 60, fontWeight: 600, lineHeight: 1.1, maxWidth: 900 }}>
          {t('ogHeadline')}
        </span>
        <span style={{ fontSize: 30, color: '#a6acc5' }}>{t('ogTagline')}</span>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <span style={{ fontSize: 26, color: '#00c2a8' }}>{COUNTRY.name}</span>
      </div>
    </div>,
    size,
  );
}
