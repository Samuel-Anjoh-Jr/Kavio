'use client';

import './[locale]/globals.css';

/**
 * Rendered only when the root layout itself throws (including locale
 * resolution failures), so it sits outside the [locale] segment and cannot
 * reliably call next-intl hooks. Kept intentionally minimal and hardcoded —
 * this is the one deliberate exception to the no-hardcoded-strings rule.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 text-center dark:bg-black">
        <div className="flex max-w-md flex-col items-center gap-4">
          <svg
            className="h-12 w-12 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Something went wrong · Une erreur est survenue
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            We hit an unexpected error and our team has been notified. Please try again.
            <br />
            Une erreur inattendue s&apos;est produite et notre équipe a été notifiée. Veuillez
            réessayer.
          </p>
          {error.digest && (
            <p className="rounded-md bg-zinc-100 px-3 py-1.5 font-mono text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => reset()}
            className="mt-2 rounded-full bg-red-500 px-6 py-2.5 font-medium text-white transition-colors hover:bg-red-600"
          >
            Try again · Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
