'use client';

import { useMemo } from 'react';
import { useQuery } from '@apollo/client/react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { RequireAuthNotice } from '@/components/messaging/require-auth-notice';
import { savedWorkerToCard } from '@/lib/discovery';
import { MY_FAVORITES_QUERY, type MyFavoritesQueryResult } from '@/lib/graphql/favorites';
import { WorkerCard, WorkerCardSkeleton } from './worker-card';

/**
 * The Saved list (DIS-02's "Save" action, given somewhere to live). Personal
 * to the signed-in identity, so a guest who reached this URL gets the same
 * sign-in invitation the other personal surfaces use.
 */
export function SavedWorkersScreen() {
  const t = useTranslations('SavedWorkers');
  const { status } = useSession();

  const { data, loading } = useQuery<MyFavoritesQueryResult>(MY_FAVORITES_QUERY, {
    skip: status !== 'authenticated',
    fetchPolicy: 'cache-and-network',
  });

  const workers = useMemo(
    () => (data?.myFavorites ?? []).map(savedWorkerToCard),
    [data?.myFavorites],
  );

  if (status === 'unauthenticated') {
    return <RequireAuthNotice titleKey="auth.title" bodyKey="auth.body" />;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {loading && workers.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <WorkerCardSkeleton key={index} />
          ))}
        </div>
      ) : workers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface/50 px-6 py-16 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-muted">
            <Bookmark aria-hidden className="size-8 text-muted-foreground" />
          </span>
          <h2 className="font-heading text-lg font-semibold text-foreground">{t('emptyTitle')}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{t('emptyBody')}</p>
          <Button asChild>
            <Link href="/app/explore">{t('emptyAction')}</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workers.map((worker) => (
            <WorkerCard key={worker.userId} worker={worker} />
          ))}
        </div>
      )}
    </div>
  );
}
