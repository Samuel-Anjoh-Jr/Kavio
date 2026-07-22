'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/datetime';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import { updateSetting } from '@/lib/admin';
import {
  ADMIN_RBAC_QUERY,
  ADMIN_SETTINGS_QUERY,
  type AdminRbacQueryResult,
  type AdminSettingsQueryResult,
  type SystemSetting,
} from '@/lib/graphql/admin';

/**
 * System settings, integrations and the RBAC matrix (ADM-07).
 *
 * The settings list is driven by the SERVER'S registry, not by whatever rows
 * happen to exist in the table: a screen driven purely by stored rows shows an
 * empty page on a fresh install, which is how settings end up undiscovered and
 * then bypassed with an environment variable.
 *
 * No secret appears here. Provider keys live in the managed secret store, and
 * the "integrations" section reports connection STATE rather than offering a
 * field to paste a key into an admin's browser.
 */
export function SettingsScreen() {
  const t = useTranslations('Admin');
  const locale = useLocale();

  const { data, loading, error, refetch } = useQuery<AdminSettingsQueryResult>(
    ADMIN_SETTINGS_QUERY,
    { fetchPolicy: 'cache-and-network', errorPolicy: 'all' },
  );

  const { data: rbacData } = useQuery<AdminRbacQueryResult>(ADMIN_RBAC_QUERY, {
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });

  const settings = data?.adminSettings ?? [];
  const rbac = rbacData?.adminRbacMatrix;

  const categories = [...new Set(settings.map((setting) => setting.category))];

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="font-heading text-lg font-semibold text-foreground">
          {t('settingsHeading')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('settingsCaption')}</p>

        {loading && !data ? (
          <div className="mt-4 flex flex-col gap-2">
            <Skeleton className="h-20 w-full rounded-card" />
            <Skeleton className="h-20 w-full rounded-card" />
          </div>
        ) : error && settings.length === 0 ? (
          <p className="mt-4 rounded-card border border-border bg-surface p-6 text-sm text-muted-foreground">
            {t('loadError')}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-6">
            {categories.map((category) => (
              <div key={category}>
                <h3 className="font-heading text-sm font-semibold text-foreground">
                  {t(`settingCategory.${category}`)}
                </h3>
                <ul className="mt-3 flex flex-col gap-3">
                  {settings
                    .filter((setting) => setting.category === category)
                    .map((setting) => (
                      <SettingRow
                        key={setting.key}
                        setting={setting}
                        locale={locale}
                        onSaved={() => void refetch()}
                      />
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-heading text-lg font-semibold text-foreground">
          {t('integrationsHeading')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('integrationsCaption')}</p>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {['campay', 'mapbox', 's3', 'webpush'].map((key) => (
            <li key={key} className="rounded-card border border-border bg-surface p-4">
              <p className="font-medium text-foreground">{t(`integration.${key}.name`)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(`integration.${key}.description`)}
              </p>
            </li>
          ))}
        </ul>

        <p className="mt-3 flex items-start gap-2 rounded-card border border-dashed border-border p-4 text-sm text-muted-foreground">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t('integrationsSecretNote')}
        </p>
      </section>

      <section>
        <h2 className="font-heading text-lg font-semibold text-foreground">{t('rbacHeading')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('rbacCaption')}</p>

        {rbac && (
          <>
            <div className="mt-4 overflow-x-auto rounded-card border border-border">
              <table className="w-full min-w-[44rem] text-sm">
                <caption className="sr-only">{t('rbacTableCaption')}</caption>
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th scope="col" className="px-3 py-2 text-left text-xs font-medium">
                      {t('permission')}
                    </th>
                    {rbac.roles.map((role) => (
                      <th
                        key={role.role}
                        scope="col"
                        className="px-3 py-2 text-center text-xs font-medium"
                      >
                        {t(`role.${role.role}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rbac.permissions.map((permission) => (
                    <tr key={permission} className="border-b border-border/60 last:border-0">
                      <th
                        scope="row"
                        className="px-3 py-1.5 text-left font-numeric text-xs font-normal text-muted-foreground"
                      >
                        {permission}
                      </th>
                      {rbac.roles.map((role) => {
                        const granted = role.permissions.includes(permission);
                        return (
                          <td key={role.role} className="px-3 py-1.5 text-center">
                            {/* An icon plus a text label, never colour alone. */}
                            {granted ? (
                              <>
                                <Check aria-hidden className="inline size-4 text-success" />
                                <span className="sr-only">{t('granted')}</span>
                              </>
                            ) : (
                              <>
                                <span aria-hidden className="text-muted-foreground">
                                  —
                                </span>
                                <span className="sr-only">{t('notGranted')}</span>
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!rbac.editable && (
              <p className="mt-3 flex items-start gap-2 rounded-card border border-dashed border-border p-4 text-sm text-muted-foreground">
                <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
                {t('rbacReadOnlyNote')}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function SettingRow({
  setting,
  locale,
  onSaved,
}: {
  setting: SystemSetting;
  locale: string;
  onSaved: () => void;
}) {
  const t = useTranslations('Admin');
  const translateError = useAuthErrorMessage();

  const isBoolean = typeof setting.value === 'boolean';
  const [draft, setDraft] = useState(
    setting.value === null || setting.value === undefined ? '' : String(setting.value),
  );
  const [checked, setChecked] = useState(setting.value === true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // A numeric-looking string is sent as a number: the setting is read by
      // code that expects one, and "10" would silently fail a comparison.
      const raw = isBoolean ? checked : draft.trim();
      const value =
        typeof raw === 'string' && raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw;

      await updateSetting(setting.key, value);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(translateError(err));
    } finally {
      setSaving(false);
    }
  }

  const inputId = `setting-${setting.key}`;

  return (
    <li className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-56 flex-1">
          <Label htmlFor={inputId} className="font-numeric text-xs">
            {setting.key}
          </Label>
          {setting.description && (
            <p className="mt-1 text-sm text-muted-foreground">{setting.description}</p>
          )}

          <div className="mt-2">
            {isBoolean ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  id={inputId}
                  type="checkbox"
                  checked={checked}
                  disabled={saving}
                  onChange={(event) => setChecked(event.target.checked)}
                  className="size-4 rounded border-input"
                />
                {checked ? t('enabled') : t('disabled')}
              </label>
            ) : (
              <Input
                id={inputId}
                value={draft}
                disabled={saving}
                placeholder={t('notSet')}
                onChange={(event) => setDraft(event.target.value)}
              />
            )}
          </div>
        </div>

        <Button size="sm" variant="outline" disabled={saving} onClick={() => void save()}>
          {saving && <Loader2 aria-hidden className="animate-spin" />}
          {saving ? t('saving') : t('save')}
        </Button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {setting.updatedByName
          ? t('lastChangedBy', {
              name: setting.updatedByName,
              date: formatDateTime(setting.updatedAt, locale) ?? '',
            })
          : t('usingDefault')}
      </p>

      {saved && (
        <p role="status" className="mt-1 text-xs text-success">
          {t('settingSaved')}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}
