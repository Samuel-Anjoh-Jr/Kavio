'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/auth/field';
import { FormBanner } from '@/components/auth/form-banner';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import { restPost } from '@/lib/rest-api';

const schema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string().min(1),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'MISMATCH',
  });

type FormValues = z.infer<typeof schema>;

/**
 * Reset password (ACC-08). On success the API revokes every existing session,
 * so the user is sent to login rather than being silently signed in here.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('Auth.resetPassword');
  const translateError = useAuthErrorMessage();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  async function onSubmit(values: FormValues) {
    setError(null);

    try {
      await restPost('auth/password/reset', { token, password: values.password });
      setDone(true);
      // Brief pause so the confirmation is actually readable before the route
      // changes — an instant redirect reads as "nothing happened".
      setTimeout(() => router.push('/auth/login'), 1500);
    } catch (err) {
      setError(translateError(err));
    }
  }

  if (done) {
    return <FormBanner tone="success" message={t('success')} />;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
      {error && <FormBanner tone="error" message={error} />}

      <Field
        label={t('passwordLabel')}
        type="password"
        autoComplete="new-password"
        hint={t('passwordHint')}
        error={errors.password?.message && t('passwordInvalid')}
        {...register('password')}
      />

      <Field
        label={t('confirmLabel')}
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message && t('mismatch')}
        {...register('confirmPassword')}
      />

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
