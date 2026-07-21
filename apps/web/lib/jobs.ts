'use client';

import type { StatusTone } from '@/components/ui/status-badge';

/**
 * Shared job vocabulary for the web layer (PROMPTS 56, 58).
 *
 * The status enum and lifecycle table are owned by the API
 * (apps/api/src/jobs/job-lifecycle.model.ts); this module is the presentation
 * side of the same truth — how each state is worded and coloured, and which
 * milestones a client watches a job climb through. Kept as data, not scattered
 * conditionals, so the timeline and the chips can never disagree about what
 * "Accepted" looks like.
 */

export type JobStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'QUOTED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'RELEASED'
  | 'DISPUTED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'ARCHIVED';

export type JobUrgency = 'FLEXIBLE' | 'WITHIN_WEEK' | 'WITHIN_48_HOURS' | 'EMERGENCY';

export const JOB_URGENCIES: readonly JobUrgency[] = [
  'FLEXIBLE',
  'WITHIN_WEEK',
  'WITHIN_48_HOURS',
  'EMERGENCY',
];

/** The tone each status wears on a chip. Terminal-bad states are the only red. */
export const JOB_STATUS_TONE: Record<JobStatus, StatusTone> = {
  DRAFT: 'neutral',
  OPEN: 'primary',
  QUOTED: 'primary',
  ACCEPTED: 'accent',
  IN_PROGRESS: 'accent',
  COMPLETED: 'success',
  RELEASED: 'success',
  DISPUTED: 'warning',
  CANCELLED: 'neutral',
  REFUNDED: 'neutral',
  ARCHIVED: 'neutral',
};

/**
 * The money-backed ladder a job climbs once it is booked (JOB-06).
 *
 * ON_THE_WAY from the SRS timeline has no enum state of its own — a worker is
 * "on the way" while the job is ACCEPTED and they have not yet started — so the
 * ladder tracks the four states escrow actually moves through. Pre-acceptance
 * states (OPEN, QUOTED) and the exception branches (DISPUTED, CANCELLED,
 * REFUNDED) are handled outside the ladder, as context rather than rungs.
 */
export const JOB_MILESTONES: readonly JobStatus[] = [
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'RELEASED',
];

/** States that have left the active ladder — the screen shows a branch banner. */
export const JOB_EXCEPTION_STATUSES: readonly JobStatus[] = ['DISPUTED', 'CANCELLED', 'REFUNDED'];

export function isJobException(status: JobStatus): boolean {
  return JOB_EXCEPTION_STATUSES.includes(status);
}

/**
 * How far along the milestone ladder a status sits.
 *
 * Returns -1 for a status not on the ladder (a still-open job, or a branch),
 * so the caller shows "not started" rather than lighting up the first rung for
 * a job nobody has been hired for yet.
 */
export function jobMilestoneIndex(status: JobStatus): number {
  return JOB_MILESTONES.indexOf(status);
}

// ─────────────────────────────────────────────────────────────────────────────
// Draft persistence (JOB-02 autosave)
// ─────────────────────────────────────────────────────────────────────────────

export interface JobDraft {
  title: string;
  description: string;
  categoryId: string | null;
  urgency: JobUrgency;
  budgetMin: string;
  budgetMax: string;
  location: {
    latitude: number;
    longitude: number;
    source: string;
    landmark: string | null;
    label: string | null;
  } | null;
  photoAssetIds: string[];
  /** Server draft id once the job exists as a DRAFT row; null while local-only. */
  jobId: string | null;
}

export const EMPTY_JOB_DRAFT: JobDraft = {
  title: '',
  description: '',
  categoryId: null,
  urgency: 'FLEXIBLE',
  budgetMin: '',
  budgetMax: '',
  location: null,
  photoAssetIds: [],
  jobId: null,
};

const DRAFT_KEY = 'trustpro.job-draft';

/**
 * The draft store is read through `useSyncExternalStore` in the stepper rather
 * than copied into state from a mount effect. localStorage IS an external store
 * — one another tab can write to — so treating it as one removes the hydration
 * dance, gets cross-tab sync for free, and keeps the component free of the
 * set-state-in-effect pattern. The snapshot is cached by the raw string so a
 * render that did not write returns the SAME reference (or `useSyncExternalStore`
 * would loop forever).
 */
const draftListeners = new Set<() => void>();
let cachedDraftRaw: string | null = null;
let cachedDraft: JobDraft | null = null;

function notifyDraft(): void {
  for (const listener of draftListeners) listener();
}

export function subscribeJobDraft(callback: () => void): () => void {
  draftListeners.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key === DRAFT_KEY) callback();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    draftListeners.delete(callback);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/** Client snapshot for `useSyncExternalStore`, identity-stable between writes. */
export function readJobDraft(): JobDraft | null {
  if (typeof window === 'undefined') return null;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(DRAFT_KEY);
  } catch {
    return cachedDraft;
  }

  if (raw === cachedDraftRaw) return cachedDraft;
  cachedDraftRaw = raw;

  try {
    cachedDraft = raw ? { ...EMPTY_JOB_DRAFT, ...(JSON.parse(raw) as Partial<JobDraft>) } : null;
  } catch {
    cachedDraft = null;
  }
  return cachedDraft;
}

/** Server snapshot — no localStorage, so the stepper renders the empty draft. */
export function readJobDraftServer(): JobDraft | null {
  return null;
}

export function writeJobDraft(draft: JobDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Private browsing or a full quota. The in-memory draft still works for the
    // life of the page; only cross-reload resume is lost.
  }
  notifyDraft();
}

export function clearJobDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to do.
  }
  notifyDraft();
}

/** Parses a whole-XAF budget field. Empty or non-numeric becomes null (unset). */
export function parseBudget(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const digits = Number(trimmed.replace(/[^\d]/g, ''));
  return Number.isFinite(digits) && digits > 0 ? Math.round(digits) : null;
}
