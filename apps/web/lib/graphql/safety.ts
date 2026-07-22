import { gql } from '@apollo/client';

/**
 * Safety, SOS and live-tracking READS (DUAL API RULE). Writes are REST
 * (lib/safety.ts). Mirrors apps/api/src/safety/models/safety.model.ts and
 * apps/api/src/tracking/models/tracking.model.ts.
 */

export type SOSStatus = 'ACTIVE' | 'RESOLVED' | 'FALSE_ALARM';
export type TrackingSessionStatus = 'ACTIVE' | 'ENDED';

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string | null;
  email: string | null;
  createdAt: string;
}

/** Proof an alert reached someone — a safety feature that cannot show who it
 *  told is not a safety feature (SOS-01). */
export interface SOSAlertShare {
  id: string;
  contactName: string | null;
  channel: string;
  delivered: boolean;
  sentAt: string | null;
}

export interface SOSAlertEvent {
  fromStatus: SOSStatus | null;
  toStatus: SOSStatus;
  note: string | null;
  createdAt: string;
}

export interface SOSAlert {
  id: string;
  status: SOSStatus;
  latitude: number | null;
  longitude: number | null;
  message: string | null;
  jobId: string | null;
  bookingId: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  shares: SOSAlertShare[];
  timeline: SOSAlertEvent[];
  createdAt: string;
}

const SOS_ALERT_FIELDS = `
  id
  status
  latitude
  longitude
  message
  jobId
  bookingId
  resolvedAt
  resolutionNote
  shares {
    id
    contactName
    channel
    delivered
    sentAt
  }
  timeline {
    fromStatus
    toStatus
    note
    createdAt
  }
  createdAt
`;

export const EMERGENCY_CONTACTS_QUERY = gql`
  query MyEmergencyContacts {
    myEmergencyContacts {
      id
      name
      phone
      relationship
      email
      createdAt
    }
  }
`;

export interface EmergencyContactsQueryResult {
  myEmergencyContacts: EmergencyContact[];
}

export const SOS_HISTORY_QUERY = gql`
  query MySosAlerts {
    mySosAlerts {
      ${SOS_ALERT_FIELDS}
    }
  }
`;

export interface SosHistoryQueryResult {
  mySosAlerts: SOSAlert[];
}

/** Drives the persistent "SOS active" banner (SOS-03). */
export const ACTIVE_SOS_QUERY = gql`
  query ActiveSosAlert {
    activeSosAlert {
      ${SOS_ALERT_FIELDS}
    }
  }
`;

export interface ActiveSosQueryResult {
  activeSosAlert: SOSAlert | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Live tracking (SOS-03)
// ─────────────────────────────────────────────────────────────────────────────

export interface LivePosition {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  distanceMeters: number | null;
  etaSeconds: number | null;
  recordedAt: string;
}

export interface TrackingSession {
  id: string;
  bookingId: string;
  subjectId: string;
  viewerId: string;
  status: TrackingSessionStatus;
  consentRevoked: boolean;
  destinationLat: number | null;
  destinationLng: number | null;
  latestPosition: LivePosition | null;
  startedAt: string;
  endedAt: string | null;
}

const TRACKING_SESSION_FIELDS = `
  id
  bookingId
  subjectId
  viewerId
  status
  consentRevoked
  destinationLat
  destinationLng
  latestPosition {
    latitude
    longitude
    accuracy
    heading
    speed
    distanceMeters
    etaSeconds
    recordedAt
  }
  startedAt
  endedAt
`;

export const TRACKING_SESSIONS_QUERY = gql`
  query MyTrackingSessions {
    myTrackingSessions {
      ${TRACKING_SESSION_FIELDS}
    }
  }
`;

export interface TrackingSessionsQueryResult {
  myTrackingSessions: TrackingSession[];
}

export const TRACKING_SESSION_QUERY = gql`
  query TrackingSession($id: ID!) {
    trackingSession(id: $id) {
      ${TRACKING_SESSION_FIELDS}
    }
  }
`;

export interface TrackingSessionQueryResult {
  trackingSession: TrackingSession | null;
}
