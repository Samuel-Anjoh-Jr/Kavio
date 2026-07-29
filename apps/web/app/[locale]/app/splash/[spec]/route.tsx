import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { parseSplashSize } from '@/lib/pwa/splash-screens';

/**
 * iOS launch images, generated on demand (SYS-01) — the same `next/og`
 * approach as the manifest icons, for the same reason: no asset pipeline and no
 * dozen binaries checked into the repo for something that is a rounded square
 * and a wordmark.
 *
 * The background is the manifest's `background_color`, not the brand Indigo.
 * A launch image is meant to be the app's first frame, so matching the shell's
 * real background is what makes the transition into the app invisible; a full
 * Indigo panel would flash and then vanish.
 *
 * Deliberately light-mode only. iOS picks the launch image before the web app
 * has run any code, so there is no theme to read — a `prefers-color-scheme`
 * media query on the link tag is honoured inconsistently across iOS versions,
 * and a dark splash shown to a light-mode user is worse than a neutral one.
 */

const BACKGROUND = '#f8f9fc';
const INDIGO = '#3d5afe';

export async function GET(_request: Request, { params }: { params: Promise<{ spec: string }> }) {
  const { spec } = await params;
  const size = parseSplashSize(spec);

  if (!size) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Unknown splash size' } },
      { status: 404 },
    );
  }

  const { width, height } = size;
  const markSize = Math.round(Math.min(width, height) * 0.22);

  return new ImageResponse(
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Math.round(markSize * 0.3),
        background: BACKGROUND,
      }}
    >
      <div
        style={{
          width: markSize,
          height: markSize,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: INDIGO,
          borderRadius: Math.round(markSize * 0.24),
        }}
      >
        <svg
          width={Math.round(markSize * 0.56)}
          height={Math.round(markSize * 0.56)}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
      <div
        style={{
          fontSize: Math.round(markSize * 0.26),
          fontWeight: 600,
          color: '#1b1e2e',
          letterSpacing: -0.5,
        }}
      >
        Kavio
      </div>
    </div>,
    {
      width,
      height,
      headers: { 'Cache-Control': 'public, max-age=604800, immutable' },
    },
  );
}
