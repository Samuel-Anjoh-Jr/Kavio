'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/auth/field';
import { FormBanner } from '@/components/auth/form-banner';
import { Link } from '@/i18n/navigation';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import { restPost } from '@/lib/rest-api';

const schema = z.object({
  identifier: z.string().trim().min(1),
  website: z.string().max(0).optional(),
});

type FormValues = z.infer<typeof schema>;

/**
 * Forgot password (ACC-08).
 *
 * Success is shown for ANY well-formed identifier, matching the API's
 * deliberately uniform response: telling the user "no account with that email"
 * would turn this public form into an account-existence oracle.
 */
export function ForgotPasswordForm() {
  const t = useTranslations('Auth.forgotPassword');
  const translateError = useAuthErrorMessage();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: '', website: '' },
  });

  async function onSubmit(values: FormValues) {
    setError(null);

    try {
      await restPost('auth/password/forgot', {
        identifier: values.identifier,
        website: values.website,
      });
      setSent(true);
    } catch (err) {
      setError(translateError(err));
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-6">
        <FormBanner tone="success" message={t('sent')} />
        <Link
          href="/auth/login"
          className="text-center text-sm font-medium text-primary hover:underline"
        >
          {t('backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
      {error && <FormBanner tone="error" message={error} />}

      <Field
        label={t('identifierLabel')}
        type="text"
        inputMode="email"
        autoComplete="username"
        placeholder={t('identifierPlaceholder')}
        error={errors.identifier?.message && t('identifierRequired')}
        {...register('identifier')}
      />

      <div aria-hidden className="hidden">
        <label htmlFor="website">Website</label>
        <input id="website" type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
      </div>

      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? t('submitting') : t('submit')}
      </Button>

      <Link
        href="/auth/login"
        className="text-center text-sm font-medium text-primary hover:underline"
      >
        {t('backToLogin')}
      </Link>
    </form>
  );
}
