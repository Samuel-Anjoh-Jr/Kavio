'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { GeoJSONSource, Map as MapboxMap } from 'mapbox-gl';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { WorkerCardData } from '@/lib/discovery';
import { hasMapToken, type MapViewport } from './map-canvas';

const MapCanvas = dynamic(() => import('./map-canvas'), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-image" />,
});

/**
 * The map half of the map/list split (DIS-10).
 *
 * Two layers, two different jobs:
 *
 *  - WORKER DENSITY, a vector tile layer served from PostGIS (through CARTO when
 *    configured). It is AGGREGATE ONLY — grid-cell counts, never an individual
 *    position — which is what makes it safe to render for an anonymous visitor
 *    at country zoom. It answers "does this platform have anyone near me?"
 *    before any search has run.
 *  - INDIVIDUAL MARKERS, clustered client-side, for the workers currently in the
 *    result set. Clustering here is presentation, not analysis: the server
 *    already decided who is in range and how far away they are.
 *
 * "Search this area" appears only after the user has moved the map. Re-querying
 * on every idle would fight somebody who is just looking around, and on a
 * metered connection it would spend their data doing it.
 */

const DENSITY_SOURCE = 'kavio-density';
const WORKER_SOURCE = 'kavio-workers';

function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
}

/**
 * Borrowed from the source's own signature rather than the global `GeoJSON`
 * namespace, which mapbox-gl does not publish. One less type dependency, and it
 * cannot drift from what `setData` actually accepts.
 */
type WorkerFeatureCollection = Extract<
  Parameters<GeoJSONSource['setData']>[0],
  { type: 'FeatureCollection' }
>;

function toFeatureCollection(workers: WorkerCardData[]): WorkerFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: workers
      .filter((worker) => worker.latitude !== null && worker.longitude !== null)
      .map((worker) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [worker.longitude as number, worker.latitude as number],
        },
        properties: {
          userId: worker.userId,
          name: worker.name ?? '',
          trustScore: worker.trustScore,
        },
      })),
  };
}

export interface WorkerMapProps {
  workers: WorkerCardData[];
  center: { latitude: number; longitude: number } | null;
  /** Called when the user asks to re-search the area they have moved to. */
  onSearchArea: (viewport: MapViewport) => void;
  onSelectWorker?: (userId: string) => void;
  className?: string;
}

export function WorkerMap({
  workers,
  center,
  onSearchArea,
  onSelectWorker,
  className,
}: WorkerMapProps) {
  const t = useTranslations('Explore');
  const mapRef = useRef<MapboxMap | null>(null);
  const [movedViewport, setMovedViewport] = useState<MapViewport | null>(null);

  // Held in a ref so the map's own click handlers, registered once with the
  // style, always call the current callback. Written after commit rather than
  // during render.
  const selectRef = useRef(onSelectWorker);
  useEffect(() => {
    selectRef.current = onSelectWorker;
  }, [onSelectWorker]);

  /**
   * Adds our sources and layers. Called on first load AND after every style
   * change, because `setStyle` (which the theme toggle triggers) discards
   * everything not in the new style — including these.
   */
  const syncLayers = useCallback((map: MapboxMap) => {
    if (!map.getSource(DENSITY_SOURCE)) {
      map.addSource(DENSITY_SOURCE, {
        type: 'vector',
        url: `${apiBaseUrl()}/tiles/worker_density.json`,
      });

      map.addLayer({
        id: `${DENSITY_SOURCE}-fill`,
        type: 'fill',
        source: DENSITY_SOURCE,
        'source-layer': 'worker_density',
        // Fades out as individual markers take over, so the two layers never
        // compete to describe the same workers.
        maxzoom: 13,
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'worker_count'],
            1,
            'rgba(61, 90, 254, 0.10)',
            10,
            'rgba(61, 90, 254, 0.28)',
            40,
            'rgba(0, 194, 168, 0.42)',
          ],
          'fill-outline-color': 'rgba(61, 90, 254, 0.25)',
        },
      });
    }

    if (!map.getSource(WORKER_SOURCE)) {
      map.addSource(WORKER_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
      });

      map.addLayer({
        id: `${WORKER_SOURCE}-clusters`,
        type: 'circle',
        source: WORKER_SOURCE,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#3d5afe',
          'circle-opacity': 0.9,
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 30, 30],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      map.addLayer({
        id: `${WORKER_SOURCE}-count`,
        type: 'symbol',
        source: WORKER_SOURCE,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 13,
        },
        paint: { 'text-color': '#ffffff' },
      });

      map.addLayer({
        id: `${WORKER_SOURCE}-point`,
        type: 'circle',
        source: WORKER_SOURCE,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#00c2a8',
          'circle-radius': 9,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      map.on('click', `${WORKER_SOURCE}-point`, (event) => {
        const userId = event.features?.[0]?.properties?.userId;
        if (typeof userId === 'string') selectRef.current?.(userId);
      });

      // Tapping a cluster zooms into it rather than doing nothing, which is
      // what every map app has taught users a cluster does.
      map.on('click', `${WORKER_SOURCE}-clusters`, (event) => {
        const feature = event.features?.[0];
        const clusterId = feature?.properties?.cluster_id;
        const source = map.getSource(WORKER_SOURCE) as GeoJSONSource | undefined;
        if (!source || typeof clusterId !== 'number' || feature?.geometry.type !== 'Point') return;

        const centre =
          feature.geometry.type === 'Point'
            ? (feature.geometry.coordinates as [number, number])
            : null;

        source.getClusterExpansionZoom(clusterId, (error, zoom) => {
          // A failed expansion lookup is not worth an error message: the
          // cluster stays as it is and the next tap tries again.
          if (error || zoom === null || zoom === undefined || !centre) return;
          map.easeTo({ center: centre, zoom });
        });
      });

      for (const layer of [`${WORKER_SOURCE}-point`, `${WORKER_SOURCE}-clusters`]) {
        map.on('mouseenter', layer, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layer, () => {
          map.getCanvas().style.cursor = '';
        });
      }
    }
  }, []);

  const onReady = useCallback(
    (map: MapboxMap) => {
      mapRef.current = map;
      syncLayers(map);
      map.on('style.load', () => syncLayers(map));
    },
    [syncLayers],
  );

  // Push new results into the existing source rather than rebuilding it: the
  // cluster index is expensive, and a rebuild would blink every marker.
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(WORKER_SOURCE) as GeoJSONSource | undefined;
    source?.setData(toFeatureCollection(workers));
  }, [workers]);

  if (!hasMapToken()) {
    // No token, no base tiles. The list beside this is the whole feature, so
    // saying so plainly beats a grey rectangle that looks like a failure.
    return (
      <div className="flex h-full items-center justify-center rounded-image border border-dashed border-border bg-muted/40 p-6 text-center">
        <p className="text-sm text-muted-foreground">{t('mapUnavailable')}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="relative h-full w-full">
        <MapCanvas
          label={t('mapLabel')}
          center={center}
          zoom={12}
          onReady={onReady}
          onViewportChange={setMovedViewport}
        />

        {movedViewport && (
          <div className="absolute inset-x-0 top-3 flex justify-center px-3">
            <Button
              size="sm"
              className="shadow-lg"
              onClick={() => {
                onSearchArea(movedViewport);
                setMovedViewport(null);
              }}
            >
              <Search aria-hidden />
              {t('searchThisArea')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
