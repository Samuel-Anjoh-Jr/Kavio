import type { ReactNode } from 'react';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * The standard shell every auth screen renders inside (ACC-11: auth is never
 * "naked"). Split-screen on desktop — form left, brand panel right — and a
 * full-screen single column at phone width, which is where most Cameroonian
 * users actually are.
 *
 * The brand panel is `hidden lg:flex`: it carries no information the form needs,
 * so dropping it on small screens costs nothing and saves bandwidth.
 */
export async function AuthShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  const t = await getTranslations('Auth.brandPanel');

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between px-6 py-5 sm:px-10">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Image
              src="/brand/kavio-mark.png"
              alt=""
              aria-hidden="true"
              width={480}
              height={369}
              priority
              className="h-7 w-auto"
            />
            <span className="font-heading text-lg font-semibold tracking-tight text-foreground">
              Kavio
            </span>
          </Link>
          {/* ACC-11: language is switchable at any time, including mid-signup. */}
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 py-8 sm:px-10">
          <div className="w-full max-w-md">
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
            <div className="mt-8">{children}</div>
          </div>
        </main>
      </div>

      <aside className="relative hidden overflow-hidden bg-primary lg:flex lg:w-[42%] lg:flex-col lg:justify-center lg:px-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.18),transparent_55%)]"
        />
        <div className="relative">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-foreground/80">
            {t('slogan')}
          </p>
          <p className="mt-3 font-heading text-3xl font-semibold leading-tight text-primary-foreground">
            {t('headline')}
          </p>
          <p className="mt-4 max-w-sm text-primary-foreground/80">{t('body')}</p>

          <ul className="mt-10 space-y-4">
            {(['verified', 'escrow', 'portfolio'] as const).map((key) => (
              <li key={key} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent shadow-[0_0_0_4px_rgba(0,194,168,0.25)]"
                />
                <span className="text-sm text-primary-foreground/90">{t(`points.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
