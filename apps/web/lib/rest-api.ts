'use client';

import { fetchJson } from './api-error';
import { enqueueWrite, isQueueable, type QueuedWriteMethod } from './offline/write-queue';

/**
 * Browser-side REST writes (DUAL API RULE). Everything goes through the
 * /api/rest proxy, which attaches the bearer token from the session cookie.
 * Reads are never here — they belong to Apollo/GraphQL.
 */

function restUrl(path: string): string {
  return `/api/rest/${path.replace(/^\//, '')}`;
}

export function restPost<T>(path: string, body?: unknown): Promise<T> {
  return fetchJson<T>(restUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

export function restPatch<T>(path: string, body: unknown): Promise<T> {
  return fetchJson<T>(restUrl(path), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function restDelete<T>(path: string, body?: unknown): Promise<T> {
  return fetchJson<T>(restUrl(path), {
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

    if (reachedServer || !isQueueable(path)) throw error;

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

    xhr.addEventListener('error', () => reject(new Error('UPLOAD_FAILED')));
    xhr.send(form);
  });
}
