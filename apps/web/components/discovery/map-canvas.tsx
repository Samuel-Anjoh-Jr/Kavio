'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import type { Map as MapboxMap } from 'mapbox-gl';
import { prefersReducedMotion } from '@/lib/motion';
import { FALLBACK_VIEWPORT } from '@/lib/geo';
import { cn } from '@/lib/utils';

import 'mapbox-gl/dist/mapbox-gl.css';

/**
 * The one place Mapbox GL JS is instantiated.
 *
 * CLAUDE.md is unambiguous that Mapbox is PRESENTATION ONLY and never
 * authoritative for math. Nothing in this file measures a distance, decides
 * what is "near", or filters a result set — it renders coordinates the server
 * already computed and reports back the viewport the user moved to. Every
 * spatial answer comes from PostGIS.
 *
 * The library is loaded lazily (~200 kB gzipped) because most of what discovery
 * does is a list, and a phone on 3G should not pay for a renderer it may never
 * show. Callers should reach this through `next/dynamic` with `ssr: false` so
 * the CSS is code-split with it.
 */

/**
 * Whether a map can render at all.
 *
 * Exported so surfaces can branch BEFORE rendering: without a token Mapbox
 * cannot fetch base tiles, and a map that silently shows a blank grey rectangle
 * is worse than a screen that never promised one. Every caller has a real
 * non-map path (landmark picker, list view), and this is what selects it.
 */
export function hasMapToken(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
}

function mapStyleUrl(dark: boolean): string {
  return dark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11';
}

export interface MapViewport {
  latitude: number;
  longitude: number;
  zoom: number;
  /** [west, south, east, north] — what "search this area" sends to the server. */
  bounds: [number, number, number, number];
}

export interface MapCanvasProps {
  center?: { latitude: number; longitude: number } | null;
  zoom?: number;
  /** Runs once the style has loaded, so layers can be added safely. */
  onReady?: (map: MapboxMap) => void;
  /** Fires after the user finishes panning or zooming — drives "search this area". */
  onViewportChange?: (viewport: MapViewport) => void;
  /** Fires on every map click; the pin picker uses it to place the marker. */
  onMapClick?: (coordinates: { latitude: number; longitude: number }) => void;
  interactive?: boolean;
  className?: string;
  /** Required: a canvas with no accessible name is an unlabelled image to a screen reader. */
  label: string;
}

export function MapCanvas({
  center,
  zoom = FALLBACK_VIEWPORT.zoom,
  onReady,
  onViewportChange,
  onMapClick,
  interactive = true,
  className,
  label,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const [failed, setFailed] = useState(false);
  const { resolvedTheme } = useTheme();

  /**
   * Everything the map construction reads, held in a ref.
   *
   * The map is built ONCE. A parent re-render must never tear down and rebuild a
   * WebGL context — that would drop the user's viewport and re-download every
   * tile — so nothing reactive is referenced inside the construction effect, and
   * later changes are applied by the small effects below instead.
   */
  const latest = useRef({ onReady, onViewportChange, onMapClick, center, zoom, interactive });

  // Written after commit, never during render: a ref mutated while rendering is
  // torn by a concurrent re-render.
  useEffect(() => {
    latest.current = { onReady, onViewportChange, onMapClick, center, zoom, interactive };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current || !hasMapToken()) return;

    let cancelled = false;

    void (async () => {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        if (cancelled || !containerRef.current) return;

        mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string;

        const initial = latest.current;

        const map = new mapboxgl.Map({
          container: containerRef.current,
          // The theme effect below corrects this a frame later if it changed
          // while the library was loading.
          style: mapStyleUrl(document.documentElement.classList.contains('dark')),
          center: [
            initial.center?.longitude ?? FALLBACK_VIEWPORT.longitude,
            initial.center?.latitude ?? FALLBACK_VIEWPORT.latitude,
          ],
          zoom: initial.zoom,
          interactive: initial.interactive,
          // The compass/pitch controls add rotation nobody needs on a
          // neighbourhood map, and a rotated map is disorienting on a phone.
          pitchWithRotate: false,
          dragRotate: false,
          attributionControl: true,
          // Honours the OS setting for the whole renderer, not just our own
          // transitions: fly-to animations and marker easing all collapse.
          respectPrefersReducedMotion: true,
        });

        if (initial.interactive) {
          map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
        }

        let styleLoaded = false;

        map.on('load', () => {
          if (cancelled) return;
          styleLoaded = true;
          latest.current.onReady?.(map);
        });

        map.on('moveend', (event) => {
          if (cancelled || !latest.current.onViewportChange) return;
          // `originalEvent` is only set when the move came from a real drag,
          // wheel, or touch gesture — a programmatic move (the recentre effect
          // below, or our own "search this area" easeTo) leaves it undefined.
          // Without this check, hydrating a saved location — or the button's
          // own recentre — re-fires "moved viewport" and pops the button right
          // back up with no user interaction at all.
          if (!event.originalEvent) return;
          const bounds = map.getBounds();
          const centre = map.getCenter();
          if (!bounds) return;

          latest.current.onViewportChange({
            latitude: centre.lat,
            longitude: centre.lng,
            zoom: map.getZoom(),
            bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
          });
        });

        map.on('click', (event) => {
          if (cancelled) return;
          latest.current.onMapClick?.({
            latitude: event.lngLat.lat,
            longitude: event.lngLat.lng,
          });
        });

        // A failed style load leaves a blank canvas that looks like a bug. Say
        // so instead, and let the caller fall back to the non-map path.
        //
        // Once the style has loaded, an 'error' event almost always comes from
        // something a caller added afterwards — a worker-density tile request,
        // a GeoJSON source — not the map itself. Hiding an already-rendered map
        // over a single failed layer would be a worse experience than just
        // dropping that layer, so only the pre-load case is treated as fatal.
        map.on('error', (event) => {
          if (styleLoaded) {
            console.error('[MapCanvas] map error after style load', event.error);
            return;
          }
          setFailed(true);
        });

        mapRef.current = map;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Follow the app's light/dark setting. setStyle re-adds the base style only;
  // layers the caller added are restored by their own effects on `style.load`.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !resolvedTheme) return;

    map.setStyle(mapStyleUrl(resolvedTheme === 'dark'));
  }, [resolvedTheme]);

  // Recentre when the chosen location changes, without rebuilding the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;

    map.easeTo({
      center: [center.longitude, center.latitude],
      duration: prefersReducedMotion() ? 0 : 600,
    });
  }, [center]);

  if (!hasMapToken() || failed) return null;

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={label}
      className={cn('h-full w-full overflow-hidden rounded-image bg-muted', className)}
    />
  );
}

export default MapCanvas;
