'use client';

import { useLocale, useTranslations } from 'next-intl';
import { BadgeCheck, CalendarDays, Clock, MapPin, Star } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { RemoteImage } from '@/components/ui/remote-image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TierBadge } from '@/components/trust/tier-badge';
import { TrustScoreRing } from '@/components/trust/trust-score-ring';
import { formatArea } from '@/lib/geo';
import { formatRating, formatResponseTime, formatXaf, initials } from '@/lib/discovery';
import type { WorkerProfile } from '@/lib/graphql/discovery';
import { ProfileReviews } from '@/components/reviews/profile-reviews';
import { AvailabilityCalendar } from './availability-calendar';
import { PortfolioGallery } from './portfolio-gallery';
import { ProfileActions } from './profile-actions';

/**
 * The public worker profile (PRO-01…PRO-05).
 *
 * The screen where somebody decides whether to let a stranger into their home,
 * so it is ordered the way that decision is actually made: WHO, then CAN I
 * TRUST THEM, then WHAT DOES IT COST, then PROOF.
 *
 * ── What is deliberately absent ─────────────────────────────────────────────
 * No phone number, no email, no street address — for anyone, signed in or not.
 * The API does not return them (see WorkerProfileView), because a public
 * directory of tradesmen's phone numbers would be scraped inside a week and the
 * workers would carry the cost. Contact happens through the platform.
 *
 * ── What is never faked ─────────────────────────────────────────────────────
 * An unrated worker shows "new", not "0.0 ★". On-time percentage and the
 * response-time stat are each omitted entirely while their `*Scored` flag is
 * false, rather than rendered as a dash that scans like a bad score. All three
 * follow the same rule: a missing measurement must never be displayed as a
 * poor one.
 */
export function WorkerProfileScreen({
  profile,
  isOwner,
}: {
  profile: WorkerProfile;
  isOwner: boolean;
}) {
  const t = useTranslations('Profile');
  const locale = useLocale();

  const name = profile.name ?? t('unnamed');
  const area = formatArea({ area: profile.area, city: profile.city });
  const rating = formatRating(profile.stats.averageRating, locale);
  const isNew = profile.stats.averageRating === null && profile.stats.completedJobs === 0;
  const responseTime = formatResponseTime(profile.stats.respondsWithinMinutes, (key, values) =>
    t(`responseTime.${key}`, values),
  );

  const memberSince = new Intl.DateTimeFormat(locale === 'fr' ? 'fr-CM' : 'en-CM', {
    year: 'numeric',
    month: 'long',
  }).format(new Date(profile.memberSince));

  return (
    <div className="pb-12">
      <div className="relative">
        {profile.coverUrl ? (
          <RemoteImage src={profile.coverUrl} alt="" className="h-40 w-full object-cover sm:h-56" />
        ) : (
          // A brand gradient rather than a grey box: the absence of a cover
          // photo should not make a real profile look like a broken one.
          <div
            aria-hidden
            className="h-40 w-full bg-gradient-to-br from-primary/20 via-accent/15 to-transparent sm:h-56"
          />
        )}

        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          {/*
           * A CSS grid rather than a flex row: on a narrow phone the name block
           * routinely wraps to 3+ lines (long name + headline + a wrapping badge
           * row), and `items-end` on a flex row would then pin the much-shorter
           * avatar and trust ring to the BOTTOM of that tall row — visually
           * detaching them from the name they belong next to. The grid gives the
           * avatar and ring their own top row and lets the name block drop to a
           * full-width row underneath, so nothing floats away from its label
           * regardless of how much the name wraps. From `sm:` up there is room
           * for the original single-row layout (avatar · name · ring).
           */}
          <div className="-mt-12 grid grid-cols-[auto_1fr] items-end gap-x-4 gap-y-3 sm:-mt-16 sm:grid-cols-[auto_1fr_auto]">
            <div className="col-start-1 row-start-1">
              {profile.avatar ? (
                <RemoteImage
                  src={profile.avatar}
                  alt=""
                  className="size-24 shrink-0 rounded-full border-4 border-background object-cover sm:size-32"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex size-24 shrink-0 items-center justify-center rounded-full border-4 border-background bg-muted font-heading text-3xl font-semibold text-muted-foreground sm:size-32"
                >
                  {initials(profile.name)}
                </span>
              )}
            </div>

            <div className="col-start-2 row-start-1 min-w-0 justify-self-end sm:col-start-3 sm:justify-self-auto">
              <Link
                href={`/app/trust?subject=${profile.userId}`}
                className="inline-block shrink-0 rounded-card p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('viewTrustBreakdown')}
              >
                <TrustScoreRing score={profile.trustScore} tier={profile.tier} size="md" />
              </Link>
            </div>

            <div className="col-span-2 row-start-2 min-w-0 pb-1 sm:col-span-1 sm:col-start-2 sm:row-start-1">
              <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {name}
              </h1>
              {profile.headline && <p className="mt-1 text-muted-foreground">{profile.headline}</p>}

              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <TierBadge tier={profile.tier} size="sm" />
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
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label={t('stat.completedJobs')} value={String(profile.stats.completedJobs)} />

          <Stat
            label={t('stat.rating')}
            value={rating ?? t('stat.new')}
            hint={isNew ? t('stat.newHint') : undefined}
            icon={rating ? <Star aria-hidden className="size-4 fill-warning text-warning" /> : null}
          />

          {/* Rendered only once the jobs module can actually measure it. */}
          {profile.stats.onTimeScored && profile.stats.onTimePercentage !== null && (
            <Stat
              label={t('stat.onTime')}
              value={t('stat.percent', {
                value: String(Math.round(profile.stats.onTimePercentage)),
              })}
            />
          )}

          {/* Rendered only once this worker has answered enough direct job
              invitations for the median to mean anything (responseTimeScored). */}
          {profile.stats.responseTimeScored && responseTime && (
            <Stat
              label={t('stat.responseTime')}
              value={responseTime}
              icon={<Clock aria-hidden className="size-4 text-accent" />}
            />
          )}

          <Stat
            label={t('stat.verifications')}
            value={String(profile.stats.verifiedCheckCount)}
            icon={<BadgeCheck aria-hidden className="size-4 text-success" />}
          />
        </dl>

        <div className="mt-8">
          <ProfileActions
            workerUserId={profile.userId}
            workerName={name}
            avatar={profile.avatar}
            headline={profile.headline}
            isOwner={isOwner}
          />
        </div>

        <Tabs defaultValue="about" className="mt-10">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="about">{t('tab.about')}</TabsTrigger>
            <TabsTrigger value="services">{t('tab.services')}</TabsTrigger>
            <TabsTrigger value="portfolio">
              {t('tab.portfolio')}
              {profile.stats.portfolioCount > 0 && (
                <span className="ml-2 font-numeric text-xs text-muted-foreground">
                  {profile.stats.portfolioCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="reviews">{t('tab.reviews')}</TabsTrigger>
          </TabsList>

          <TabsContent value="about" className="mt-6">
            {profile.bio ? (
              <p className="max-w-2xl whitespace-pre-line text-foreground">{profile.bio}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{t('bioEmpty')}</p>
            )}

            <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4 text-sm">
              {profile.yearsExperience !== null && (
                <div>
                  <dt className="text-muted-foreground">{t('yearsExperience')}</dt>
                  <dd className="font-numeric text-lg font-semibold text-foreground">
                    {profile.yearsExperience}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">{t('stat.endorsements')}</dt>
                <dd className="font-numeric text-lg font-semibold text-foreground">
                  {profile.stats.endorsementCount}
                </dd>
              </div>
            </dl>

            {profile.verifications.length > 0 && (
              <section className="mt-8">
                <h2 className="font-heading text-sm font-semibold text-foreground">
                  {t('verificationsHeading')}
                </h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {profile.verifications.map((verification) => (
                    <li
                      key={verification.checkType}
                      className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-3 py-1 text-sm text-success"
                    >
                      <BadgeCheck aria-hidden className="size-3.5" />
                      {t(`check.${verification.checkType}`)}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* The landmark is how an address is actually given here, so it is
                shown verbatim — it is the worker's own description, not a
                precise location. */}
            {profile.landmark && (
              <p className="mt-6 text-sm text-muted-foreground">
                {t('landmark', { landmark: profile.landmark })}
              </p>
            )}
          </TabsContent>

          <TabsContent value="services" className="mt-6">
            {profile.services.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('servicesEmpty')}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {profile.services.map((service) => {
                  const price = formatXaf(service.startingPrice, locale);
                  const category =
                    locale === 'fr' ? service.categoryNameFr : service.categoryNameEn;

                  return (
                    <li
                      key={service.id}
                      className="flex flex-wrap items-start justify-between gap-4 rounded-card border border-border bg-surface p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-foreground">{service.name}</h3>
                        {category && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{category}</p>
                        )}
                        {service.description && (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {service.description}
                          </p>
                        )}
                      </div>

                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{t('startingFrom')}</p>
                        {/* "On request" beats a fabricated number: transparent
                            pricing means honest pricing, including honesty
                            about work that genuinely cannot be quoted blind. */}
                        <p className="font-numeric text-lg font-semibold text-foreground">
                          {price ?? t('priceOnRequest')}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <section className="mt-10">
              <h2 className="font-heading text-base font-semibold text-foreground">
                {t('availabilityHeading')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('availabilityHint')}</p>
              <div className="mt-4">
                <AvailabilityCalendar
                  availability={profile.availability}
                  exceptions={profile.availabilityExceptions}
                />
              </div>
            </section>
          </TabsContent>

          <TabsContent value="portfolio" className="mt-6">
            <PortfolioGallery groups={profile.portfolio} workerUserId={profile.userId} />
          </TabsContent>

          <TabsContent value="reviews" className="mt-6">
            {/* Summary and list both come from the reviews service (REV-02),
                which is the one place that excludes hidden reviews from the
                average — so what a visitor counts here always reconciles with
                the number above it. */}
            <ProfileReviews subjectId={profile.userId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex items-center gap-1.5 font-numeric text-2xl font-semibold text-foreground">
        {icon}
        {value}
      </dd>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
