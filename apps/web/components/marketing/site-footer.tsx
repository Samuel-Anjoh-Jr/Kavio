import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/**
 * The marketing footer.
 *
 * Carries the legal pages the compliance baseline requires at launch — Terms,
 * Privacy, Refund/Dispute policy — linked from here because a legal page nobody
 * can find is not shipped (SRS §26.6).
 *
 * There are NO admin or agent entry points here, and that omission is the point
 * (landing hygiene, SRS §26.6). "Staff login" links in a footer are a habit
 * borrowed from intranets: on a conversion surface they add a dead end for 100%
 * of visitors and publish a map of privileged routes for the few looking for
 * one. Internal users reach their console by URL.
 */
export function SiteFooter() {
  const t = useTranslations('Marketing.footer');
  const year = new Date().getFullYear();

  const legal = [
    { href: '/legal/terms', label: t('terms') },
    { href: '/legal/privacy', label: t('privacy') },
    { href: '/legal/refunds', label: t('refunds') },
  ] as const;

  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex max-w-xs flex-col gap-3">
            <span className="flex items-center gap-2">
              <Image
                src="/brand/kavio-mark.png"
                alt=""
                aria-hidden="true"
                width={480}
                height={369}
                className="h-8 w-auto"
              />
              <span className="font-heading text-lg font-semibold text-foreground">Kavio</span>
            </span>
            <p className="text-sm text-muted-foreground">{t('tagline')}</p>
          </div>

          <nav aria-label={t('legalHeading')} className="flex flex-col gap-2">
            <h2 className="font-heading text-sm font-semibold text-foreground">
              {t('legalHeading')}
            </h2>
            {legal.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-button text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <nav aria-label={t('productHeading')} className="flex flex-col gap-2">
            <h2 className="font-heading text-sm font-semibold text-foreground">
              {t('productHeading')}
            </h2>
            <Link
              href="/app/explore"
              className="rounded-button text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('browseWorkers')}
            </Link>
            <Link
              href="/app/jobs"
              className="rounded-button text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('browseJobs')}
            </Link>
            <Link
              href="/auth/signup"
              className="rounded-button text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('joinAsWorker')}
            </Link>
          </nav>
        </div>

        <p className="text-xs text-muted-foreground">{t('copyright', { year })}</p>
      </div>
    </footer>
  );
}
