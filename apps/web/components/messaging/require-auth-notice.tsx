'use client';

import { useTranslations } from 'next-intl';
import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link, usePathname } from '@/i18n/navigation';

/**
 * The "sign in to continue" panel for personal surfaces a guest reached by URL
 * (messages, notifications, safety). Guests browse the marketplace freely
 * (ACC-01), but an inbox is theirs alone — so rather than an empty list, they get
 * an invitation that carries them back here after login (ACC-02).
 */
export function RequireAuthNotice({
  titleKey = 'auth.title',
  bodyKey = 'auth.body',
}: {
  titleKey?: string;
  bodyKey?: string;
}) {
  const t = useTranslations('Messaging');
  const pathname = usePathname();

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-20 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <LogIn aria-hidden className="size-6" />
      </span>
      <h1 className="font-heading text-xl font-semibold text-foreground">{t(titleKey)}</h1>
      <p className="text-sm text-muted-foreground">{t(bodyKey)}</p>
      <Button asChild>
        <Link href={`/auth/login?next=${encodeURIComponent(pathname)}`}>{t('auth.signIn')}</Link>
      </Button>
    </div>
  );
}
