import { useTranslations, useFormatter } from 'next-intl';
import { LocaleSwitcher } from '@/components/locale-switcher';

export default function Home() {
  const t = useTranslations('HomePage');
  const format = useFormatter();

  const sampleAmount = 2500;
  const sampleDate = new Date('2026-07-20');

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-zinc-50 px-6 py-24 text-center dark:bg-black">
      <div className="self-end">
        <LocaleSwitcher />
      </div>
      <div className="flex max-w-xl flex-col items-center gap-4">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">{t('heading')}</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">{t('tagline')}</p>
      </div>
      <dl className="grid grid-cols-2 gap-6 text-left">
        <div>
          <dt className="text-sm text-zinc-500 dark:text-zinc-400">{t('sampleAmountLabel')}</dt>
          <dd className="text-xl font-medium text-zinc-900 dark:text-zinc-50">
            {format.number(sampleAmount, 'currency')}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-zinc-500 dark:text-zinc-400">{t('sampleDateLabel')}</dt>
          <dd className="text-xl font-medium text-zinc-900 dark:text-zinc-50">
            {format.dateTime(sampleDate, 'short')}
          </dd>
        </div>
      </dl>
    </div>
  );
}
