import { useTranslations } from 'next-intl';
import { Compass } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { SystemState } from '@/components/system/system-state';

/**
 * 404 for anything under a locale (SYS-04).
 *
 * Renders inside the locale layout, so it inherits the theme, fonts and
 * NextIntlClientProvider — which is why it can translate at all, unlike the
 * root `app/not-found.tsx` that sits outside the segment.
 *
 * The escape routes matter more than the apology: a dead link should land the
 * user on discovery (the thing they were probably looking for) rather than on a
 * page whose only affordance is the back button.
 */
export default function LocaleNotFound() {
  const t = useTranslations('SystemStates.notFound');

  return (
    <SystemState
      tone="primary"
      icon={<Compass aria-hidden="true" />}
      title={t('title')}
      description={t('description')}
      action={
        <Button asChild variant="primary">
          <Link href="/app/explore">{t('browse')}</Link>
        </Button>
      }
      secondaryAction={
        <Button asChild variant="ghost">
          <Link href="/">{t('home')}</Link>
        </Button>
      }
    />
  );
}
