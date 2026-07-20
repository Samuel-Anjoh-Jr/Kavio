import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    formats: {
      number: {
        // XAF has no minor unit — Intl already renders it with 0 decimals,
        // this just makes that explicit for any future currency added.
        currency: { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 },
      },
      dateTime: {
        short: { day: 'numeric', month: 'short', year: 'numeric' },
      },
    },
  };
});
