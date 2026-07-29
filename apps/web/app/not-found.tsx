import Link from 'next/link';
import './[locale]/globals.css';

/**
 * 404 for paths that never resolved a locale at all (e.g. `/nonsense`, hit
 * before the i18n middleware could prefix anything). It sits outside the
 * `[locale]` segment, so — exactly like `app/global-error.tsx` — it has no
 * NextIntlClientProvider above it and cannot translate.
 *
 * Both languages are therefore rendered together. This is the second and last
 * deliberate exception to the no-hardcoded-strings rule (SYS-03), for the same
 * reason as the first: the alternative is guessing a locale we do not have.
 */
export default function RootNotFound() {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6 text-center dark:bg-neutral-900">
        <div className="flex max-w-md flex-col items-center gap-4">
          <span className="flex size-16 items-center justify-center rounded-3xl bg-indigo-50 dark:bg-indigo-950">
            <svg
              className="size-8 text-indigo-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M14.8 9.2l-1.6 4.4-4.4 1.6 1.6-4.4z" />
            </svg>
          </span>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Page not found · Page introuvable
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            The page you asked for does not exist or has moved.
            <br />
            La page demandée n&apos;existe pas ou a été déplacée.
          </p>
          <Link
            href="/en"
            className="mt-2 rounded-xl bg-indigo-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Go to Kavio · Aller à Kavio
          </Link>
        </div>
      </body>
    </html>
  );
}
