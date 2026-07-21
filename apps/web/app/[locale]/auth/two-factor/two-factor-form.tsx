'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/auth/field';
import { FormBanner } from '@/components/auth/form-banner';
import { useRouter } from '@/i18n/navigation';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import { peekIntent, safeReturnTo } from '@/lib/intent';

/**
 * Second-factor challenge (ACC-08). Reached only after correct credentials, so
 * the copy says "finish signing in" — the user is not being told they failed.
 */
export function TwoFactorForm({ identifier, next }: { identifier: string; next: string | null }) {
  const t = useTranslations('Auth.twoFactor');
  const translateError = useAuthErrorMessage();
  const router = useRouter();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await signIn('two-factor', {
      identifier,
      code: code.replace(/\D/g, ''),
      redirect: false,
    });

    setSubmitting(false);

    if (result?.error) {
      setError(translateError(result.code ?? 'INVALID_CODE'));
      return;
    }

    const pending = peekIntent();
    router.push(safeReturnTo(pending?.returnTo ?? next, '/app'));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      {error && <FormBanner tone="error" message={error} />}

      <Field
        label={t('codeLabel')}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={10}
        placeholder="123456"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        hint={t('codeHint')}
      />

      <Button type="submit" size="lg" disabled={submitting || code.trim().length === 0}>
        {submitting ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
