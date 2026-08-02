'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { RemoteImage } from '@/components/ui/remote-image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TierBadge } from '@/components/trust/tier-badge';
import { TrustScoreRing } from '@/components/trust/trust-score-ring';
import { formatArea } from '@/lib/geo';
import { formatRating, initials } from '@/lib/discovery';
import type { BusinessProfile } from '@/lib/graphql/discovery';

/**
 * The public company profile (PRO-06), tabs About / Jobs / Reviews / Team /
 * Documents.
 *
 * ── The Documents tab shows claims, never documents ─────────────────────────
 * It lists WHICH registrations staff verified and when — not the files. A
 * business's RCCM scan carries the owner's legal name, signature and address; it
 * was uploaded so somebody could check it, not so the public could read it. The
 * trust signal a client actually needs is "somebody checked this and it was
 * real", and a verified badge says exactly that while publishing nothing.
 *
 * The RCCM NUMBER is shown, because that register is public: printing it is what
 * lets a client verify us instead of trusting us.
 */
export function BusinessProfileScreen({ profile }: { profile: BusinessProfile }) {
  const t = useTranslations('Business');
  const locale = useLocale();

  const area = formatArea({ area: profile.area, city: profile.city });
  const rating = formatRating(profile.stats.averageRating, locale);

  const memberSince = new Intl.DateTimeFormat(locale === 'fr' ? 'fr-CM' : 'en-CM', {
    year: 'numeric',
    month: 'long',
  }).format(new Date(profile.createdAt));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 pb-12 sm:px-6">
      <div className="flex flex-wrap items-start gap-4">
        {profile.logoUrl ? (
          <RemoteImage
            src={profile.logoUrl}
            alt=""
            className="size-20 shrink-0 rounded-card border border-border object-cover sm:size-24"
          />
        ) : (
          <span
            aria-hidden
            className="flex size-20 shrink-0 items-center justify-center rounded-card border border-border bg-muted font-heading text-2xl font-semibold text-muted-foreground sm:size-24"
          >
            {initials(profile.name)}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {profile.name}
            </h1>

            {/* The Verified Business badge only appears once staff approved the
                registration. An unverified company gets no badge at all rather
                than a grey "unverified" one — a badge that says nothing still
                reads as a credential at a glance. */}
            {profile.verified && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-3 py-1 text-sm font-medium text-success">
                <ShieldCheck aria-hidden className="size-4" />
                {t('verifiedBusiness')}
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <TierBadge tier={profile.ownerTier} size="sm" />
            {area && (
              <span className="flex items-center gap-1">
                <MapPin aria-hidden className="size-3.5" />
                {area}
              </span>
            )}
            <span className="flex items-center gap-1">
              <CalendarDays aria-hidden className="size-3.5" />
              {t('memberSince', { date: memberSince })}
            </span>
          </div>
        </div>

        <TrustScoreRing
          score={profile.stats.trustScore}
          tier={profile.ownerTier}
          size="md"
          className="shrink-0"
        />
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={t('stat.team')} value={String(profile.stats.teamSize)} />
        <Stat label={t('stat.completedJobs')} value={String(profile.stats.completedJobs)} />
        <Stat label={t('stat.rating')} value={rating ?? t('stat.unrated')} />
        {/* Zero open jobs and "we cannot count jobs yet" look identical as a
            zero, so the stat is omitted until the jobs module can answer. */}
        {profile.stats.jobsAvailable && (
          <Stat label={t('stat.openJobs')} value={String(profile.stats.openJobCount)} />
        )}
      </dl>

      <Tabs defaultValue="about" className="mt-10">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="about">{t('tab.about')}</TabsTrigger>
          <TabsTrigger value="jobs">{t('tab.jobs')}</TabsTrigger>
          <TabsTrigger value="reviews">{t('tab.reviews')}</TabsTrigger>
          <TabsTrigger value="team">{t('tab.team')}</TabsTrigger>
          <TabsTrigger value="documents">{t('tab.documents')}</TabsTrigger>
        </TabsList>

        <TabsContent value="about" className="mt-6">
          {profile.description ? (
            <p className="max-w-2xl whitespace-pre-line text-foreground">{profile.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('descriptionEmpty')}</p>
          )}

          <dl className="mt-6 flex flex-col gap-3 text-sm">
            {profile.address && (
              <div className="flex items-start gap-2">
                <dt className="sr-only">{t('address')}</dt>
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <dd className="text-foreground">{profile.address}</dd>
              </div>
            )}

            {/* Business contact details are published by the business itself and
                are never the owner's personal account details — see
                BusinessProfileView.contactEmail. */}
            {profile.contactEmail && (
              <div className="flex items-center gap-2">
                <dt className="sr-only">{t('email')}</dt>
                <Mail aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <dd>
                  <a
                    href={`mailto:${profile.contactEmail}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {profile.contactEmail}
                  </a>
                </dd>
              </div>
            )}

            {profile.contactPhone && (
              <div className="flex items-center gap-2">
                <dt className="sr-only">{t('phone')}</dt>
                <Phone aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <dd>
                  <a
                    href={`tel:${profile.contactPhone}`}
                    className="font-numeric text-primary underline-offset-4 hover:underline"
                  >
                    {profile.contactPhone}
                  </a>
                </dd>
              </div>
            )}

            {profile.rccmNumber && (
              <div className="flex items-center gap-2">
                <dt className="text-muted-foreground">{t('rccm')}</dt>
                <dd className="font-numeric text-foreground">{profile.rccmNumber}</dd>
              </div>
            )}
          </dl>
        </TabsContent>

        <TabsContent value="jobs" className="mt-6">
          <EmptyTab
            icon={<Building2 aria-hidden className="size-8 text-muted-foreground" />}
            message={
              profile.stats.jobsAvailable
                ? t('jobsEmpty', { name: profile.name })
                : t('jobsUnavailable')
            }
          />
        </TabsContent>

        <TabsContent value="reviews" className="mt-6">
          <div className="rounded-card border border-border bg-surface p-6">
            <p className="font-numeric text-4xl font-semibold text-foreground">{rating ?? '—'}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('ratedJobs', { count: profile.stats.completedJobs })}
            </p>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{t('reviewListUnavailable')}</p>
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          {profile.team.length === 0 ? (
            <EmptyTab message={t('teamEmpty')} />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {profile.team.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center gap-3 rounded-card border border-border bg-surface p-4"
                >
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
                  >
                    {initials(member.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{member.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {member.roles.map((role) => t(`role.${role}`)).join(', ')}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <p className="text-sm text-muted-foreground">{t('documentsExplainer')}</p>

          {profile.credentials.length === 0 ? (
            <div className="mt-4">
              <EmptyTab message={t('documentsEmpty')} />
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {profile.credentials.map((credential) => (
                <li
                  key={credential.labelKey}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4"
                >
                  {/* The API sends a KEY ("credential.rccm"), never display
                      copy, so a credential we have no translation for yet
                      degrades to the raw key instead of crashing the tab. */}
                  <span className="font-medium text-foreground">
                    {t.has(credential.labelKey) ? t(credential.labelKey) : credential.labelKey}
                  </span>

                  {credential.verified ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-3 py-1 text-sm text-success">
                      <BadgeCheck aria-hidden className="size-3.5" />
                      {credential.verifiedAt
                        ? t('verifiedOn', {
                            date: new Intl.DateTimeFormat(
                              locale === 'fr' ? 'fr-CM' : 'en-CM',
                            ).format(new Date(credential.verifiedAt)),
                          })
                        : t('verified')}
                    </span>
                  ) : (
                    <span className="rounded-full border border-border bg-muted px-3 py-1 text-sm text-muted-foreground">
                      {t('notVerified')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-numeric text-2xl font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function EmptyTab({ icon, message }: { icon?: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
      {icon}
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
