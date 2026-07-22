import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuditLogViewer } from '@/components/admin/audit-log-viewer';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin' });
  return { title: t('auditTitle'), robots: { index: false } };
}

/** Admin-gated by the console layout; authorisation is the API's own guards. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Admin');

  return (
    <div>
      <h2 className="font-heading text-xl font-semibold text-foreground">{t('auditTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('auditSubtitle')}</p>
      <div className="mt-6">
        <AuditLogViewer />
      </div>
    </div>
  );
}
