'use client';

import { useLocale, useTranslations } from 'next-intl';
import { routing } from '@/i18n/routing';
import { usePathname, useRouter } from '@/i18n/navigation';

export function LocaleSwitcher() {
  const t = useTranslations('LocaleSwitcher');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="sr-only">{t('label')}</span>
      <select
        value={locale}
        onChange={(event) => router.replace(pathname, { locale: event.target.value })}
        className="rounded-input border border-input bg-surface px-3 py-1.5 font-medium text-surface-foreground"
      >
        {routing.locales.map((value) => (
          <option key={value} value={value}>
            {t(value)}
          </option>
        ))}
      </select>
    </label>
  );
}
