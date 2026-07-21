/**
 * Safety domain events (SOS-01, SOS-03). The safety service emits these when an
 * alert is raised, updated or resolved; a live safety dashboard and the internal
 * notification path subscribe. The event carries ids and a coarse position — never
 * more than a listener needs to route the alert.
 */

export const SOS_TRIGGERED = 'sos.triggered';
export const SOS_RESOLVED = 'sos.resolved';

export class SosTriggeredEvent {
  readonly alertId: string;
  readonly userId: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly message: string | null;
  /** How many personal contacts the alert was shared with. */
  readonly contactCount: number;
  readonly requestId?: string;

  constructor(init: {
    alertId: string;
    userId: string;
    latitude: number | null;
    longitude: number | null;
    message: string | null;
    contactCount: number;
    requestId?: string;
  }) {
    this.alertId = init.alertId;
    this.userId = init.userId;
    this.latitude = init.latitude;
    this.longitude = init.longitude;
    this.message = init.message;
    this.contactCount = init.contactCount;
    this.requestId = init.requestId;
  }
}

export class SosResolvedEvent {
  readonly alertId: string;
  readonly userId: string;
  readonly requestId?: string;

  constructor(init: { alertId: string; userId: string; requestId?: string }) {
    this.alertId = init.alertId;
    this.userId = init.userId;
    this.requestId = init.requestId;
  }
}
