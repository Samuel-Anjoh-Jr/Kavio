'use client';

import { restDelete, restPost } from '@/lib/rest-api';

/**
 * Saved-worker WRITES (REST, per the DUAL API RULE). Reads are GraphQL
 * (lib/graphql/favorites.ts). Both idempotent on the API — see
 * FavoritesService — so a double-tap from a slow connection is harmless.
 */

export function saveFavorite(workerId: string): Promise<{ workerId: string }> {
  return restPost('favorites', { workerId });
}

export function removeFavorite(workerId: string): Promise<{ workerId: string }> {
  return restDelete(`favorites/${workerId}`);
}
