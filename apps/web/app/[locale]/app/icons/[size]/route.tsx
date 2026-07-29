import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';

/**
 * Generates the PWA manifest icons on the fly via `next/og` (no image
 * asset pipeline / extra dependency needed). Referenced by
 * `app/[locale]/app/manifest.webmanifest/route.ts` and by the app layout's
 * `apple` icon metadata. The Kavio mark (public/brand/kavio-mark.png) is
 * composited onto a neutral-50 square, reused across variants; the maskable
 * variant shrinks the mark into the safe zone so OS adaptive-icon cropping
 * never clips it.
 */

const NEUTRAL_50 = '#f8f9fc';

// public/brand/kavio-mark.png is 480x369 (source: cropped transparent mark).
const MARK_ASPECT_RATIO = 480 / 369;

const MARK_DATA_URI = `data:image/png;base64,${readFileSync(
  path.join(process.cwd(), 'public/brand/kavio-mark.png'),
).toString('base64')}`;

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
  const markHeight = Math.round(size * markScaleRatio);
  const markWidth = Math.round(markHeight * MARK_ASPECT_RATIO);

  return new ImageResponse(
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: NEUTRAL_50,
        borderRadius: Math.round(size * cornerRadiusRatio),
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- next/og requires a plain <img>, not next/image. */}
      <img src={MARK_DATA_URI} width={markWidth} height={markHeight} alt="" />
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
