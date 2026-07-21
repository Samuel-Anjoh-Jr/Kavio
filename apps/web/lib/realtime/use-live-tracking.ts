'use client';

import { useEffect, useRef, useState } from 'react';
import { createRealtimeSocket, type Socket } from './socket';

/**
 * Live tracking over WebSocket (PROMPT 74; SOS-03). Two hooks, two roles:
 *   • useTrackingViewer — the client watches a session and sees the worker's
 *     position + ETA tick in.
 *   • useLocationStreamer — the worker streams their Geolocation position while
 *     the screen is open (foreground only; consent is granted by starting the
 *     session over REST first).
 */

export interface LivePosition {
  sessionId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  recordedAt: string;
  travel: { distanceMeters: number; etaSeconds: number } | null;
}

export function useTrackingViewer(
  sessionId: string | null,
  token: string | null,
): { connected: boolean; position: LivePosition | null; ended: boolean } {
  const [connected, setConnected] = useState(false);
  const [position, setPosition] = useState<LivePosition | null>(null);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (!sessionId || !token) return;

    const socket = createRealtimeSocket('/tracking', { token });
    socket.on('connect', () => {
      setConnected(true);
      socket.emit('session:watch', { sessionId });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('position', (p: LivePosition) => {
      if (p.sessionId === sessionId) setPosition(p);
    });
    socket.on('tracking:ended', () => setEnded(true));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      setConnected(false);
    };
  }, [sessionId, token]);

  return { connected, position, ended };
}

/**
 * Streams the worker's foreground position for a session. Uses the browser
 * Geolocation `watchPosition`, so it stops the moment the component unmounts (the
 * screen closes) — there is no background tracking, by design and by platform.
 */
export function useLocationStreamer(
  sessionId: string | null,
  token: string | null,
  enabled: boolean,
): { streaming: boolean; error: string | null } {
  const socketRef = useRef<Socket | null>(null);
  const [streaming, setStreaming] = useState(false);
  // Lazy initializer (runs during render, not in an effect) so the unsupported
  // case never calls setState synchronously inside the effect. SSR-safe: on the
  // server `navigator` is undefined, so it initialises to null and resolves on
  // the client's first render.
  const [error, setError] = useState<string | null>(() =>
    typeof navigator !== 'undefined' && !navigator.geolocation
      ? 'Geolocation is not available on this device.'
      : null,
  );

  useEffect(() => {
    if (!sessionId || !token || !enabled) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }

    const socket = createRealtimeSocket('/tracking', { token });
    socketRef.current = socket;

    socket.on('tracking:ended', () => {
      // The server refused a ping (consent revoked or session ended). Stop.
      setStreaming(false);
    });

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setStreaming(true);
        setError(null);
        socket.emit('ping', {
          sessionId,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? undefined,
          heading: pos.coords.heading ?? undefined,
          speed: pos.coords.speed ?? undefined,
        });
      },
      (geoErr) => setError(geoErr.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setStreaming(false);
    };
  }, [sessionId, token, enabled]);

  return { streaming, error };
}
