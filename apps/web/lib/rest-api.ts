'use client';

import { ApiError, fetchJson } from './api-error';
import { isKnownOffline, isNetworkFailure, reportNetworkFailure } from './offline/connectivity';
import { enqueueWrite, isQueueable, type QueuedWriteMethod } from './offline/write-queue';

/**
 * Browser-side REST writes (DUAL API RULE). Everything goes through the
 * /api/rest proxy, which attaches the bearer token from the session cookie.
 * Reads are never here — they belong to Apollo/GraphQL.
 */

function restUrl(path: string): string {
  return `/api/rest/${path.replace(/^\//, '')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline guard (SYS-02, SYS-06).
//
// A write attempted with no connection must say so, inline, instead of failing
// as an unexplained "something went wrong" or, worse, appearing to do nothing.
// Every form in the app already renders an ApiError's message in its own error
// banner, so the guard speaks that same contract: an ApiError with code
// OFFLINE. Nothing is sent and nothing is queued, which is what keeps money and
// trust-state writes (escrow, payouts, verification) from ever being attempted
// or deferred while offline. Content writes that are SAFE to defer go through
// `restWrite` below instead.
//
// The message is localized: this module has no translator of its own, so the
// app shell hands it the EN/FR string (components/pwa/offline-indicator.tsx).
// ─────────────────────────────────────────────────────────────────────────────

export const OFFLINE_ERROR_CODE = 'OFFLINE';

let offlineWriteMessage = OFFLINE_ERROR_CODE;

/** Set by the app shell with the active locale's copy. */
export function setOfflineWriteMessage(message: string): void {
  offlineWriteMessage = message;
}

function offlineError(): ApiError {
  return new ApiError(0, {
    // No request left the device, so there is no requestId to quote; an empty
    // one keeps forms from printing a meaningless support reference.
    error: { code: OFFLINE_ERROR_CODE, message: offlineWriteMessage, requestId: '' },
  });
}

export function isOfflineError(error: unknown): boolean {
  return error instanceof ApiError && error.code === OFFLINE_ERROR_CODE;
}

async function onlineFetchJson<T>(url: string, init: RequestInit): Promise<T> {
  if (isKnownOffline()) throw offlineError();

  try {
    return await fetchJson<T>(url, init);
  } catch (error) {
    if (isNetworkFailure(error)) {
      reportNetworkFailure();
      throw offlineError();
    }
    throw error;
  }
}

export function restPost<T>(path: string, body?: unknown): Promise<T> {
  return onlineFetchJson<T>(restUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

export function restPatch<T>(path: string, body: unknown): Promise<T> {
  return onlineFetchJson<T>(restUrl(path), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function restDelete<T>(path: string, body?: unknown): Promise<T> {
  return onlineFetchJson<T>(restUrl(path), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

/**
 * An offline-tolerant write (SYS-02, NFR-PWA-02).
 *
 * Tries the network first; if the request cannot leave the device, persists it
 * to the offline queue and reports that it was DEFERRED rather than done. The
 * caller must branch on `status` — that is the point of the return shape. A
 * helper that swallowed the difference would let a form show "Saved" for
 * something sitting in IndexedDB, which is precisely the silent failure SYS-06
 * forbids.
 *
 * Not every write may take this path: `isQueueable` refuses money and
 * trust-state writes, which throw as normal so the UI can say so plainly. See
 * lib/offline/write-queue.ts for why.
 */
export type OfflineWriteResult<T> =
  { status: 'sent'; data: T } | { status: 'queued'; queuedAt: number };

export async function restWrite<T>(
  path: string,
  options: {
    method?: QueuedWriteMethod;
    body?: Record<string, unknown>;
    /** Two writes sharing this key collapse under last-write-wins. */
    dedupeKey?: string | null;
  } = {},
): Promise<OfflineWriteResult<T>> {
  const { method = 'POST', body = {}, dedupeKey = null } = options;

  if (isKnownOffline()) {
    if (!isQueueable(path)) throw offlineError();
    const entry = await enqueueWrite({ path, method, body, dedupeKey });
    return { status: 'queued', queuedAt: entry.updatedAt };
  }

  try {
    const data = await fetchJson<T>(restUrl(path), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: 'sent', data };
  } catch (error) {
    // A response that arrived — any status — is the server's answer, not a
    // connectivity problem, and replaying it later would not change it.
    const reachedServer = typeof (error as { status?: number }).status === 'number';

    if (reachedServer) throw error;
    if (!isQueueable(path)) throw isNetworkFailure(error) ? offlineError() : error;

    const entry = await enqueueWrite({ path, method, body, dedupeKey });
    return { status: 'queued', queuedAt: entry.updatedAt };
  }
}

export interface UploadResult {
  id: string;
  kind: string;
  url: string | null;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Multipart upload with real progress. Uses XMLHttpRequest rather than fetch
 * because fetch still cannot report upload progress — and on a Cameroonian
 * mobile connection a portfolio photo without a progress bar reads as a hang.
 */
export function restUpload(
  path: string,
  file: File,
  fields: Record<string, string>,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    // Same contract as the upload's own failures below: an Error whose `name`
    // is the code and whose message is user-facing copy.
    const offline = () => {
      const error = new Error(offlineWriteMessage);
      error.name = OFFLINE_ERROR_CODE;
      return error;
    };

    if (isKnownOffline()) {
      reject(offline());
      return;
    }

    const form = new FormData();
    form.append('file', file);
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value);
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', restUrl(path));

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(xhr.responseText) as unknown;
      } catch {
        reject(new Error('UPLOAD_FAILED'));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parsed as UploadResult);
        return;
      }

      const body = parsed as { error?: { code?: string; message?: string } };
      const error = new Error(body?.error?.message ?? 'Upload failed.');
      error.name = body?.error?.code ?? 'UPLOAD_FAILED';
      reject(error);
    });

    xhr.addEventListener('error', () => {
      // A transport-level failure: the bytes never reached the server.
      reportNetworkFailure();
      reject(navigator.onLine ? new Error('UPLOAD_FAILED') : offline());
    });
    xhr.send(form);
  });
}
