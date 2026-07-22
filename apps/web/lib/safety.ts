'use client';

import type { StatusTone } from '@/components/ui/status-badge';
import { restDelete, restPatch, restPost } from '@/lib/rest-api';
import type { SOSAlert, SOSStatus } from '@/lib/graphql/safety';

/**
 * Safety & SOS WRITES + shared vocabulary (SOS-01, SOS-02, SOS-03). Reads are
 * GraphQL (lib/graphql/safety.ts).
 */

export const SOS_STATUS_TONE: Record<SOSStatus, StatusTone> = {
  ACTIVE: 'danger',
  RESOLVED: 'success',
  FALSE_ALARM: 'neutral',
};

/**
 * How long the SOS control must be held before it fires (SOS-01).
 *
 * Press-and-hold rather than a tap, and 1.2s rather than 3: long enough that a
 * pocket brush cannot raise an alert, short enough that someone frightened is
 * not fighting the interface. The progress ring makes the wait legible so it
 * never feels broken.
 */
export const SOS_HOLD_MS = 1200;

export interface TriggerSosInput {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  message?: string;
  jobId?: string;
  bookingId?: string;
}

export function triggerSos(input: TriggerSosInput): Promise<SOSAlert> {
  return restPost<SOSAlert>('sos', input);
}

export function updateSosLocation(
  alertId: string,
  position: { latitude: number; longitude: number; accuracy?: number },
): Promise<{ updated: boolean }> {
  return restPost<{ updated: boolean }>(`sos/${alertId}/location`, position);
}

export function resolveSos(
  alertId: string,
  status: 'RESOLVED' | 'FALSE_ALARM',
  note?: string,
): Promise<SOSAlert> {
  return restPost<SOSAlert>(`sos/${alertId}/resolve`, { status, ...(note ? { note } : {}) });
}

export interface EmergencyContactInput {
  name: string;
  phone: string;
  relationship?: string;
  email?: string;
}

export function addEmergencyContact(input: EmergencyContactInput): Promise<{ id: string }> {
  return restPost<{ id: string }>('emergency-contacts', input);
}

export function updateEmergencyContact(
  id: string,
  input: Partial<EmergencyContactInput>,
): Promise<{ id: string }> {
  return restPatch<{ id: string }>(`emergency-contacts/${id}`, input);
}

export function removeEmergencyContact(id: string): Promise<{ removed: boolean }> {
  return restDelete<{ removed: boolean }>(`emergency-contacts/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Live tracking (SOS-03)
// ─────────────────────────────────────────────────────────────────────────────

export function startTrackingSession(input: {
  bookingId: string;
  destinationLat?: number;
  destinationLng?: number;
}): Promise<{ id: string }> {
  return restPost<{ id: string }>('tracking/sessions', input);
}

/** The worker withdraws consent. Revocable at any time is the whole contract. */
export function revokeTrackingConsent(sessionId: string): Promise<{ revoked: boolean }> {
  return restPost<{ revoked: boolean }>(`tracking/sessions/${sessionId}/revoke`);
}

export function endTrackingSession(sessionId: string): Promise<{ ended: boolean }> {
  return restPost<{ ended: boolean }>(`tracking/sessions/${sessionId}/end`);
}

/**
 * Reads the browser's position once, for attaching to an SOS.
 *
 * Resolves to null rather than rejecting on denial or timeout: an alert with no
 * coordinates is far better than no alert, so a refused permission must never be
 * what stops someone raising one.
 */
export function readCurrentPosition(
  timeoutMs = 5000,
): Promise<{ latitude: number; longitude: number; accuracy?: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? undefined,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 10_000 },
    );
  });
}

/** "12 min" / "1 h 05" — an ETA a person reads at a glance. */
export function formatEta(etaSeconds: number | null): string | null {
  if (etaSeconds === null || !Number.isFinite(etaSeconds) || etaSeconds < 0) {
    return null;
  }

  const minutes = Math.max(1, Math.round(etaSeconds / 60));
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
}

/** "800 m" / "4.2 km" — metric, because Cameroon is. */
export function formatDistance(distanceMeters: number | null): string | null {
  if (distanceMeters === null || !Number.isFinite(distanceMeters) || distanceMeters < 0) {
    return null;
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters / 10) * 10} m`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km`;
}
