'use client';

/**
 * A minimal promise wrapper over IndexedDB (NFR-PWA-01/02).
 *
 * Hand-rolled rather than pulling in `idb`: this needs four operations against
 * two key/value stores, and on the low-bandwidth phone connections TrustPro
 * targets, every avoided kilobyte of JS is a real cost avoided. There is no
 * generic query surface here on purpose — if a caller ever needs cursors or
 * indexes, that is the signal to adopt a real library instead of growing this.
 *
 * Every operation resolves to a fallback instead of rejecting when IndexedDB is
 * unavailable (private browsing, disabled storage, quota exceeded). Offline
 * support is an enhancement: losing it must degrade the app to "online only",
 * never break it.
 */

const DB_NAME = 'trustpro-offline';
const DB_VERSION = 1;

export const STORE_APOLLO = 'apollo-cache';
export const STORE_WRITE_QUEUE = 'write-queue';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_APOLLO)) db.createObjectStore(STORE_APOLLO);
      if (!db.objectStoreNames.contains(STORE_WRITE_QUEUE)) db.createObjectStore(STORE_WRITE_QUEUE);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function getDatabase(): Promise<IDBDatabase | null> {
  dbPromise ??= openDatabase();
  return dbPromise;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fallback: T,
  operation: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return getDatabase().then((db) => {
    if (!db) return fallback;

    return new Promise<T>((resolve) => {
      try {
        const transaction = db.transaction(store, mode);
        const request = operation(transaction.objectStore(store));
        request.onsuccess = () => resolve((request.result as T) ?? fallback);
        request.onerror = () => resolve(fallback);
        transaction.onabort = () => resolve(fallback);
      } catch {
        resolve(fallback);
      }
    });
  });
}

export function idbGet<T>(store: string, key: string): Promise<T | null> {
  return run<T | null>(store, 'readonly', null, (s) => s.get(key));
}

export function idbSet(store: string, key: string, value: unknown): Promise<void> {
  return run<void>(store, 'readwrite', undefined, (s) => s.put(value, key)).then(() => undefined);
}

export function idbDelete(store: string, key: string): Promise<void> {
  return run<void>(store, 'readwrite', undefined, (s) => s.delete(key)).then(() => undefined);
}

export function idbGetAll<T>(store: string): Promise<T[]> {
  return run<T[]>(store, 'readonly', [], (s) => s.getAll());
}
