import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { AdminNav } from '@/components/admin/admin-nav';

/**
 * The admin console shell (ADM-01).
 *
 * The active-role check here is a ROUTING courtesy, not the control:
 * authorisation is the API's `admin:*` guards on every read and write, which a
 * client cannot talk past. Gating on the ACTIVE role rather than held roles is
 * deliberate — an admin currently acting as a Client is browsing as a client,
 * and the console is not part of that session.
 *
 * Applying it in the LAYOUT means every admin route inherits the check; a new
 * page under /app/admin cannot forget to add it.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: '/auth/login?next=/app/admin', locale });
  }
  if (session?.user?.activeRole !== 'ADMIN') {
    redirect({ href: '/app/home', locale });
  }

  const t = await getTranslations('Admin');

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
        {t('consoleTitle')}
      </h1>
      <div className="mt-4">
        <AdminNav />
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
