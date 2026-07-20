import { useTranslations, useFormatter } from 'next-intl';
import { LocaleSwitcher } from '@/components/locale-switcher';

export default function Home() {
  const t = useTranslations('HomePage');
  const format = useFormatter();

  const sampleAmount = 2500;
  const sampleDate = new Date('2026-07-20');

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-background px-6 py-24 text-center">
      <div className="self-end">
        <LocaleSwitcher />
      </div>
      <div className="flex max-w-xl flex-col items-center gap-4">
        <h1 className="font-heading text-3xl font-semibold text-foreground">{t('heading')}</h1>
        <p className="text-lg text-muted-foreground">{t('tagline')}</p>
      </div>
      <dl className="grid grid-cols-2 gap-6 text-left">
        <div>
          <dt className="text-sm text-muted-foreground">{t('sampleAmountLabel')}</dt>
          <dd className="font-numeric text-xl font-medium text-foreground">
            {format.number(sampleAmount, 'currency')}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t('sampleDateLabel')}</dt>
          <dd className="font-numeric text-xl font-medium text-foreground">
            {format.dateTime(sampleDate, 'short')}
          </dd>
        </div>
      </dl>
    </div>
  );
}
