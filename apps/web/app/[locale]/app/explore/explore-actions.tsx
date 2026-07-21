'use client';

import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { useRequireAuth } from '@/components/auth/require-auth';

/**
 * The gated entry points on the guest exploration surface (ACC-01, ACC-02).
 *
 * Browsing is free; posting is not. A guest tapping "Post a job" has their
 * intent captured and is bounced to auth, then returned here — the redirect is
 * a detour, not a dead end.
 */
export function ExploreActions() {
  const t = useTranslations('Explore');
  const requireAuth = useRequireAuth();
  const router = useRouter();

  return (
    <Button
      size="lg"
      onClick={() =>
        requireAuth('post_job', () => router.push('/app/jobs/new'), {
          returnTo: '/app/jobs/new',
        })
      }
    >
      <Plus aria-hidden />
      {t('postJob')}
    </Button>
  );
}
