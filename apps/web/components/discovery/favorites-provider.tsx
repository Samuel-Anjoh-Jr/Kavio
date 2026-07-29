'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useApolloClient, useQuery } from '@apollo/client/react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useIntentReplay } from '@/components/auth/require-auth';
import { useToast } from '@/components/ui/use-toast';
import type { VerificationTier } from '@/lib/trust';
import { saveFavorite, removeFavorite } from '@/lib/favorites';
import {
  MY_FAVORITES_QUERY,
  type MyFavoritesQueryResult,
  type SavedWorker,
} from '@/lib/graphql/favorites';

/**
 * Saved workers, shared by every worker card (DIS-02) so a bookmark saved on
 * one rail shows saved everywhere else without a query per card.
 *
 * A guest's tap is intercepted by `useRequireAuth` before it ever reaches
 * this provider (ACC-02); the one thing this provider does for a guest is
 * replay the save once they return from login, via `useIntentReplay` — the
 * same resume contract `post_job` already uses.
 */

export interface SavableWorker {
  userId: string;
  name: string | null;
  avatar: string | null;
  headline: string | null;
  city: string | null;
  tier: VerificationTier;
  trustScore: number;
  completedJobs: number;
  averageRating: number | null;
}

interface FavoritesContextValue {
  isSaved: (workerId: string) => boolean;
  toggle: (worker: SavableWorker) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const apollo = useApolloClient();
  const t = useTranslations('WorkerCard');
  const { toast } = useToast();

  const { data, refetch } = useQuery<MyFavoritesQueryResult>(MY_FAVORITES_QUERY, {
    skip: status !== 'authenticated',
    fetchPolicy: 'cache-and-network',
  });

  const savedIds = useMemo(
    () => new Set((data?.myFavorites ?? []).map((worker) => worker.userId)),
    [data?.myFavorites],
  );

  const isSaved = useCallback((workerId: string) => savedIds.has(workerId), [savedIds]);

  const writeCache = useCallback(
    (mutate: (current: SavedWorker[]) => SavedWorker[]) => {
      const existing = apollo.readQuery<MyFavoritesQueryResult>({ query: MY_FAVORITES_QUERY });
      apollo.writeQuery<MyFavoritesQueryResult>({
        query: MY_FAVORITES_QUERY,
        data: { myFavorites: mutate(existing?.myFavorites ?? []) },
      });
    },
    [apollo],
  );

  const save = useCallback(
    async (worker: SavableWorker) => {
      if (savedIds.has(worker.userId)) return;

      // Optimistic: the card flips before the round trip, reverted on failure.
      writeCache((current) => [
        { ...worker, savedAt: new Date().toISOString() },
        ...current.filter((existing) => existing.userId !== worker.userId),
      ]);

      try {
        await saveFavorite(worker.userId);
      } catch {
        writeCache((current) => current.filter((existing) => existing.userId !== worker.userId));
        toast({ title: t('saveFailed'), variant: 'danger' });
      }
    },
    [savedIds, writeCache, toast, t],
  );

  const remove = useCallback(
    async (workerId: string) => {
      const existing = apollo.readQuery<MyFavoritesQueryResult>({ query: MY_FAVORITES_QUERY });
      const removed = existing?.myFavorites.find((worker) => worker.userId === workerId) ?? null;

      writeCache((current) => current.filter((worker) => worker.userId !== workerId));

      try {
        await removeFavorite(workerId);
      } catch {
        if (removed) writeCache((current) => [removed, ...current]);
        toast({ title: t('unsaveFailed'), variant: 'danger' });
      }
    },
    [apollo, writeCache, toast, t],
  );

  const toggle = useCallback(
    async (worker: SavableWorker) => {
      if (savedIds.has(worker.userId)) {
        await remove(worker.userId);
      } else {
        await save(worker);
      }
    },
    [savedIds, save, remove],
  );

  // The intent payload only carries the worker id (ACC-02's captured intent is
  // deliberately minimal — no secrets, and no stale profile snapshot to trust).
  // A refetch after the write fills the rest in from the server.
  useIntentReplay('save_favorite', (intent) => {
    if (status !== 'authenticated') return;
    const workerId = intent.payload?.userId;
    if (typeof workerId !== 'string') return;

    void saveFavorite(workerId)
      .then(() => refetch())
      .catch(() => toast({ title: t('saveFailed'), variant: 'danger' }));
  });

  const value = useMemo(() => ({ isSaved, toggle }), [isSaved, toggle]);

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used inside a FavoritesProvider.');
  }
  return context;
}
