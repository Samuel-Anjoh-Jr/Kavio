'use client';

import { fetchJson } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import { idbDelete, idbGetAll, idbSet, STORE_WRITE_QUEUE } from './idb';

const logger = createLogger('offline-queue');

/**
 * Offline write queue (NFR-PWA-02, SYS-02).
 *
 * Writes are REST (DUAL API RULE), so this queues REST calls — never GraphQL.
 * A write attempted with no network is persisted to IndexedDB and replayed on
 * reconnect, in the order it was made.
 *
 * CONFLICT POLICY — last-write-wins for simple fields. Two edits to the same
 * logical thing (same `dedupeKey`) collapse into ONE queued call whose body is
 * the shallow merge of both, later field values winning. That is the whole of
 * the policy, and it is chosen for what it refuses to do: it never tries to
 * merge nested structures, and it never reorders across different keys. A
 * three-way merge of a job draft edited on two devices is a correctness problem
 * no client-side heuristic can solve honestly, so this does not pretend to.
 *
 * What is NOT queued, deliberately: anything that moves money or changes trust
 * state (escrow, payouts, verification decisions, dispute rulings). Replaying a
 * payment minutes later against a state machine that has since advanced is how
 * double charges happen. Those surfaces must fail loudly while offline — see
 * `isQueueable`.
 */

export type QueuedWriteMethod = 'POST' | 'PATCH' | 'DELETE';

export interface QueuedWrite {
  id: string;
  path: string;
  method: QueuedWriteMethod;
  body: Record<string, unknown>;
  /**
   * Identifies the logical target ("job-draft:abc"). Two enqueues sharing a key
   * collapse under last-write-wins. `null` means "never collapse" — each call is
   * a distinct intent (e.g. sending two different messages).
   */
  dedupeKey: string | null;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  lastError: string | null;
}

export interface EnqueueInput {
  path: string;
  method: QueuedWriteMethod;
  body?: Record<string, unknown>;
  dedupeKey?: string | null;
}

/**
 * Paths whose writes must never be replayed later. Matched as prefixes against
 * the REST path. See the module note above for why this list exists.
 */
const NON_QUEUEABLE_PREFIXES = [
  'payments',
  'escrow',
  'wallet',
  'disputes',
  'verification',
  'admin',
  'auth',
];

export function isQueueable(path: string): boolean {
  const normalised = path.replace(/^\//, '');
  return !NON_QUEUEABLE_PREFIXES.some(
    (prefix) => normalised === prefix || normalised.startsWith(`${prefix}/`),
  );
}

/**
 * Last-write-wins merge of two queued writes for the same target (pure).
 *
 * The later body's fields overwrite the earlier one's; fields only the earlier
 * body set survive. `createdAt` stays at the FIRST edit so queue order (and
 * therefore replay order) reflects when the user started the change, not when
 * they last touched it — otherwise a repeatedly-edited draft would keep jumping
 * to the back of the queue behind writes the user made after it.
 */
export function mergeQueued(existing: QueuedWrite, incoming: QueuedWrite): QueuedWrite {
  return {
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt,
    body: { ...existing.body, ...incoming.body },
    // A merged entry is a fresh intent: past failures of the superseded body
    // say nothing about this one.
    attempts: 0,
    lastError: null,
  };
}

/** Applies `mergeQueued` across a queue, returning the queue in replay order (pure). */
export function collapseQueue(queue: QueuedWrite[], incoming: QueuedWrite): QueuedWrite[] {
  const index =
    incoming.dedupeKey === null
      ? -1
      : queue.findIndex((entry) => entry.dedupeKey === incoming.dedupeKey);

  const next =
    index === -1
      ? [...queue, incoming]
      : queue.map((entry, i) => (i === index ? mergeQueued(entry, incoming) : entry));

  return next.sort((a, b) => a.createdAt - b.createdAt);
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function readQueue(): Promise<QueuedWrite[]> {
  const entries = await idbGetAll<QueuedWrite>(STORE_WRITE_QUEUE);
  return entries.sort((a, b) => a.createdAt - b.createdAt);
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscriptions — the offline indicator and any "pending changes" affordance
// read the queue depth from here rather than polling IndexedDB.
// ─────────────────────────────────────────────────────────────────────────────

type Listener = (queue: QueuedWrite[]) => void;
const listeners = new Set<Listener>();
let snapshot: QueuedWrite[] = [];

function publish(queue: QueuedWrite[]) {
  snapshot = queue;
  for (const listener of listeners) listener(queue);
}

export function subscribeToQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function queueSnapshot(): QueuedWrite[] {
  return snapshot;
}

/** Loads the persisted queue into memory. Call once, on app-shell mount. */
export async function hydrateQueue(): Promise<void> {
  publish(await readQueue());
}

/**
 * Persists a write for later replay and returns the entry.
 *
 * Callers reach this through `restWrite` in lib/rest-api.ts rather than
 * directly, so "try the network, queue on failure" is one decision made in one
 * place instead of at every call site.
 */
export async function enqueueWrite(input: EnqueueInput): Promise<QueuedWrite> {
  const now = Date.now();
  const entry: QueuedWrite = {
    id: newId(),
    path: input.path,
    method: input.method,
    body: input.body ?? {},
    dedupeKey: input.dedupeKey ?? null,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    lastError: null,
  };

  const existing = await readQueue();
  const collapsed = collapseQueue(existing, entry);

  // Whichever entry now represents this intent — `entry` itself when nothing
  // collapsed, or the merged record (which keeps the ORIGINAL id) when it did.
  // Writing under that id overwrites the superseded record in place, so a
  // collapse can never leave a duplicate behind.
  const persisted =
    collapsed.find((e) =>
      entry.dedupeKey === null ? e.id === entry.id : e.dedupeKey === entry.dedupeKey,
    ) ?? entry;

  await idbSet(STORE_WRITE_QUEUE, persisted.id, persisted);
  publish(collapsed);

  logger.info('Write queued for reconnect', {
    payload: { path: entry.path, method: entry.method, depth: collapsed.length },
  });

  return persisted;
}

export interface FlushResult {
  sent: number;
  failed: number;
}

let flushing = false;

/**
 * Replays the queue oldest-first. Called on `online`, and once at mount in case
 * the browser came back while the tab was closed.
 *
 * Ordering is strict and sequential, not parallel: a draft edit followed by a
 * publish must land in that order, and firing both at once would race them.
 *
 * A 4xx is TERMINAL — the server rejected the intent (validation, permission, a
 * job that no longer exists), and retrying an unacceptable body forever is how a
 * queue becomes a permanent blockage. It is dropped and logged. A 5xx or a
 * transport failure leaves the entry queued for the next attempt.
 */
export async function flushQueue(): Promise<FlushResult> {
  if (flushing) return { sent: 0, failed: 0 };
  flushing = true;

  try {
    const queue = await readQueue();
    let sent = 0;
    let failed = 0;

    for (const entry of queue) {
      try {
        await fetchJson(`/api/rest/${entry.path.replace(/^\//, '')}`, {
          method: entry.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry.body),
        });
        await idbDelete(STORE_WRITE_QUEUE, entry.id);
        sent += 1;
      } catch (error) {
        const status = (error as { status?: number }).status;
        const terminal = typeof status === 'number' && status >= 400 && status < 500;

        if (terminal) {
          await idbDelete(STORE_WRITE_QUEUE, entry.id);
          logger.warn('Queued write rejected by server; dropped', {
            payload: { path: entry.path, status },
          });
        } else {
          await idbSet(STORE_WRITE_QUEUE, entry.id, {
            ...entry,
            attempts: entry.attempts + 1,
            lastError: (error as Error).message,
          });
          // Stop at the first retryable failure: the network is evidently still
          // down, and marching through the rest only burns battery and inflates
          // every entry's attempt count for the same one reason.
          failed = queue.length - sent;
          break;
        }
      }
    }

    publish(await readQueue());
    if (sent > 0) logger.info('Offline queue flushed', { payload: { sent, failed } });
    return { sent, failed };
  } finally {
    flushing = false;
  }
}
