import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';

/**
 * Generates the PWA manifest icons on the fly via `next/og` (no image
 * asset pipeline / extra dependency needed). Referenced by
 * `app/[locale]/app/manifest.webmanifest/route.ts` and by the app layout's
 * `apple` icon metadata. A single Indigo TMDS mark (rounded square + white
 * checkmark) is reused across variants; the maskable variant shrinks the
 * mark into the safe zone so OS adaptive-icon cropping never clips it.
 */

const INDIGO = '#3d5afe';

type IconVariant = {
  size: number;
  cornerRadiusRatio: number;
  markScaleRatio: number;
};

const VARIANTS: Record<string, IconVariant> = {
  '192': { size: 192, cornerRadiusRatio: 0.2, markScaleRatio: 0.6 },
  '512': { size: 512, cornerRadiusRatio: 0.2, markScaleRatio: 0.6 },
  '512-maskable': { size: 512, cornerRadiusRatio: 0, markScaleRatio: 0.42 },
  'apple-180': { size: 180, cornerRadiusRatio: 0, markScaleRatio: 0.58 },
};

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: sizeParam } = await params;
  const variant = VARIANTS[sizeParam];

  if (!variant) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Unknown icon size' } },
      { status: 404 },
    );
  }

  const { size, cornerRadiusRatio, markScaleRatio } = variant;
  const markSize = Math.round(size * markScaleRatio);

  return new ImageResponse(
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: INDIGO,
        borderRadius: Math.round(size * cornerRadiusRatio),
      }}
    >
      <svg
        width={markSize}
        height={markSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ffffff"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    </div>,
    {
      width: size,
      height: size,
      headers: {
        'Cache-Control': 'public, max-age=86400',
      },
    },
  );
}
