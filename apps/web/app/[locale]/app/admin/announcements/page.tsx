import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { AnnouncementsManager } from '@/components/admin/announcements-manager';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin' });
  return { title: t('announcementsTitle'), robots: { index: false } };
}

/** Admin-gated by the console layout; authorisation is the API's own guards. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Admin');

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="w-fit gap-1.5">
        <Link href="/app/admin">
          <ArrowLeft aria-hidden className="size-4" />
          {t('backToConsole')}
        </Link>
      </Button>

      <h2 className="mt-4 font-heading text-xl font-semibold text-foreground">
        {t('announcementsTitle')}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('announcementsSubtitle')}</p>
      <div className="mt-6">
        <AnnouncementsManager />
      </div>
    </div>
  );
}
