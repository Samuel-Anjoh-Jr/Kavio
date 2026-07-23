import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';

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
        <div
          style={{
            width: 72,
            height: 72,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#3d5afe',
            borderRadius: 18,
          }}
        >
          <svg
            width={40}
            height={40}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <span style={{ fontSize: 40, fontWeight: 600 }}>TrustPro</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span style={{ fontSize: 60, fontWeight: 600, lineHeight: 1.1, maxWidth: 900 }}>
          {t('ogHeadline')}
        </span>
        <span style={{ fontSize: 30, color: '#a6acc5' }}>{t('ogTagline')}</span>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <span style={{ fontSize: 26, color: '#00c2a8' }}>Douala</span>
        <span style={{ fontSize: 26, color: '#7d84a3' }}>·</span>
        <span style={{ fontSize: 26, color: '#00c2a8' }}>Yaoundé</span>
      </div>
    </div>,
    size,
  );
}
