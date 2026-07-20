import { useTranslations, useFormatter } from 'next-intl';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Reveal } from '@/components/motion/reveal';

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
      <Reveal className="flex max-w-xl flex-col items-center gap-4">
        <h1 className="font-heading text-3xl font-semibold text-foreground">{t('heading')}</h1>
        <p className="text-lg text-muted-foreground">{t('tagline')}</p>
      </Reveal>
      <Reveal className="grid grid-cols-2 gap-6 text-left">
        <div>
          <p className="text-sm text-muted-foreground">{t('sampleAmountLabel')}</p>
          <p className="font-numeric text-xl font-medium text-foreground">
            {format.number(sampleAmount, 'currency')}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{t('sampleDateLabel')}</p>
          <p className="font-numeric text-xl font-medium text-foreground">
            {format.dateTime(sampleDate, 'short')}
          </p>
        </div>
      </Reveal>
    </div>
  );
}
