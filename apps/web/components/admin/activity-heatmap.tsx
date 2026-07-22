'use client';

import { useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type { Map as MapboxMap } from 'mapbox-gl';
import { hasMapToken } from '@/components/discovery/map-canvas';
import { FALLBACK_VIEWPORT } from '@/lib/geo';
import type { ActivityCell } from '@/lib/graphql/admin';

// ~200 kB of renderer, loaded only when an admin actually opens the monitor.
const MapCanvas = dynamic(
  () => import('@/components/discovery/map-canvas').then((mod) => mod.MapCanvas),
  { ssr: false },
);

const SOURCE_ID = 'admin-activity';
const LAYER_ID = 'admin-activity-heat';

/**
 * The platform activity heatmap (ADM-06).
 *
 * PostGIS aggregates the cells and Mapbox draws them — the stack rule, and also
 * the privacy control. The server snaps jobs to a grid and drops any cell below
 * the aggregation floor, so the raw coordinates never leave the database and no
 * cell on this map can be traced back to one person's address. Rendering raw
 * points and clustering them in the browser would publish exactly that.
 *
 * `intensity` is already normalised 0–1 against the busiest cell, so the ramp
 * uses its full range whatever the absolute volumes are.
 */
export function ActivityHeatmap({ cells }: { cells: ActivityCell[] }) {
  const t = useTranslations('Admin');
  const mapRef = useRef<MapboxMap | null>(null);

  const applyLayer = useCallback((map: MapboxMap, data: ActivityCell[]) => {
    const geojson = {
      type: 'FeatureCollection' as const,
      features: data.map((cell) => ({
        type: 'Feature' as const,
        properties: { intensity: cell.intensity, jobCount: cell.jobCount },
        geometry: { type: 'Point' as const, coordinates: [cell.longitude, cell.latitude] },
      })),
    };

    const existing = map.getSource(SOURCE_ID);
    if (existing && 'setData' in existing) {
      (existing as { setData: (value: typeof geojson) => void }).setData(geojson);
      return;
    }

    map.addSource(SOURCE_ID, { type: 'geojson', data: geojson });
    map.addLayer({
      id: LAYER_ID,
      type: 'heatmap',
      source: SOURCE_ID,
      paint: {
        'heatmap-weight': ['get', 'intensity'],
        // A single hue ramping light→dark is the sequential rule; a rainbow
        // ramp would imply categories where there is only magnitude.
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(61, 90, 254, 0)',
          0.3,
          'rgba(61, 90, 254, 0.35)',
          0.6,
          'rgba(61, 90, 254, 0.6)',
          1,
          'rgba(61, 90, 254, 0.9)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 18, 14, 40],
        'heatmap-opacity': 0.75,
      },
    });
  }, []);

  const onReady = useCallback(
    (map: MapboxMap) => {
      mapRef.current = map;
      applyLayer(map, cells);
    },
    [applyLayer, cells],
  );

  // No token means no base tiles. A blank grey rectangle is worse than saying so.
  if (!hasMapToken()) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-card border border-dashed border-border py-12 text-center">
        <p className="text-sm font-medium text-foreground">{t('heatmapUnavailable')}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t('heatmapUnavailableBody')}</p>
      </div>
    );
  }

  const firstCell = cells[0];

  if (!firstCell) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-card border border-dashed border-border py-12 text-center">
        <p className="text-sm font-medium text-foreground">{t('heatmapEmpty')}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t('heatmapEmptyBody')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <MapCanvas
        label={t('heatmapLabel')}
        center={{ latitude: firstCell.latitude, longitude: firstCell.longitude }}
        zoom={FALLBACK_VIEWPORT.zoom}
        onReady={onReady}
        className="h-80 w-full overflow-hidden rounded-card border border-border"
      />
      <p className="text-xs text-muted-foreground">
        {t('heatmapCaption', { cells: cells.length })}
      </p>
    </div>
  );
}
