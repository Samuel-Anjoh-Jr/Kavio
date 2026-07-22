'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { Bell, Loader2, Plus, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatDate } from '@/lib/datetime';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_STATUS_TONE,
  createAnnouncement,
  updateAnnouncement,
} from '@/lib/admin';
import {
  ADMIN_ANNOUNCEMENTS_QUERY,
  type AdminAnnouncementsQueryResult,
  type Announcement,
  type AnnouncementAudience,
} from '@/lib/graphql/admin';

/**
 * Announcements (ADM-07).
 *
 * BOTH languages are required on the form, exactly as they are on the API. The
 * platform is bilingual by requirement, and an optional French body is one that
 * ends up empty — leaving half the users an announcement they cannot read.
 * Making the field required is the only version of "bilingual" that holds.
 *
 * Publishing is a separate, explicit action from saving. An announcement that
 * goes live the instant it is created is one that goes live half-written.
 */
export function AnnouncementsManager() {
  const t = useTranslations('Admin');
  const locale = useLocale();

  const { data, loading, error, refetch } = useQuery<AdminAnnouncementsQueryResult>(
    ADMIN_ANNOUNCEMENTS_QUERY,
    { fetchPolicy: 'cache-and-network', errorPolicy: 'all' },
  );

  const announcements = data?.adminAnnouncements ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('announcementsCaption')}</p>
        <AnnouncementDialog onSaved={() => void refetch()} />
      </div>

      {loading && !data ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-24 w-full rounded-card" />
          <Skeleton className="h-24 w-full rounded-card" />
        </div>
      ) : error && announcements.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-sm text-muted-foreground">
          {t('loadError')}
        </p>
      ) : announcements.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border py-14 text-center">
          <Bell aria-hidden className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{t('noAnnouncements')}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t('noAnnouncementsBody')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {announcements.map((announcement) => (
            <AnnouncementRow
              key={announcement.id}
              announcement={announcement}
              locale={locale}
              onChanged={() => void refetch()}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AnnouncementRow({
  announcement,
  locale,
  onChanged,
}: {
  announcement: Announcement;
  locale: string;
  onChanged: () => void;
}) {
  const t = useTranslations('Admin');
  const translateError = useAuthErrorMessage();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(status: 'PUBLISHED' | 'ARCHIVED') {
    setWorking(true);
    setError(null);
    try {
      await updateAnnouncement(announcement.id, { status });
      onChanged();
    } catch (err) {
      setError(translateError(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <li className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">
              {locale === 'fr' ? announcement.titleFr : announcement.titleEn}
            </span>
            <StatusBadge
              tone={ANNOUNCEMENT_STATUS_TONE[announcement.status]}
              size="sm"
              label={t(`announcementStatus.${announcement.status}`)}
            />
            <StatusBadge tone="primary" size="sm" label={t(`audience.${announcement.audience}`)} />
          </div>

          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
            {locale === 'fr' ? announcement.bodyFr : announcement.bodyEn}
          </p>

          <p className="mt-2 text-xs text-muted-foreground">
            {t('byAuthor', { name: announcement.authorName ?? t('unnamed') })}
            {announcement.publishedAt
              ? ` · ${t('publishedOn', { date: formatDate(announcement.publishedAt, locale) ?? '' })}`
              : ''}
            {announcement.expiresAt
              ? ` · ${t('expiresOn', { date: formatDate(announcement.expiresAt, locale) ?? '' })}`
              : ''}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          {announcement.status === 'DRAFT' && (
            <Button size="sm" disabled={working} onClick={() => void setStatus('PUBLISHED')}>
              {working ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
              {t('publish')}
            </Button>
          )}
          {announcement.status === 'PUBLISHED' && (
            <Button
              variant="outline"
              size="sm"
              disabled={working}
              onClick={() => void setStatus('ARCHIVED')}
            >
              {t('archive')}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

function AnnouncementDialog({ onSaved }: { onSaved: () => void }) {
  const t = useTranslations('Admin');
  const translateError = useAuthErrorMessage();

  const [open, setOpen] = useState(false);
  const [titleEn, setTitleEn] = useState('');
  const [titleFr, setTitleFr] = useState('');
  const [bodyEn, setBodyEn] = useState('');
  const [bodyFr, setBodyFr] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('ALL');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createAnnouncement({
        titleEn: titleEn.trim(),
        titleFr: titleFr.trim(),
        bodyEn: bodyEn.trim(),
        bodyFr: bodyFr.trim(),
        audience,
      });
      setOpen(false);
      setTitleEn('');
      setTitleFr('');
      setBodyEn('');
      setBodyFr('');
      setAudience('ALL');
      onSaved();
    } catch (err) {
      setError(translateError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden />
          {t('newAnnouncement')}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('newAnnouncementTitle')}</DialogTitle>
          <DialogDescription>{t('newAnnouncementSubtitle')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ann-title-en">{t('titleEn')}</Label>
              <Input
                id="ann-title-en"
                value={titleEn}
                required
                minLength={3}
                maxLength={160}
                disabled={submitting}
                onChange={(event) => setTitleEn(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ann-title-fr">{t('titleFr')}</Label>
              <Input
                id="ann-title-fr"
                value={titleFr}
                required
                minLength={3}
                maxLength={160}
                disabled={submitting}
                onChange={(event) => setTitleFr(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ann-body-en">{t('bodyEn')}</Label>
            <textarea
              id="ann-body-en"
              value={bodyEn}
              required
              minLength={10}
              maxLength={4000}
              rows={4}
              disabled={submitting}
              onChange={(event) => setBodyEn(event.target.value)}
              className="w-full rounded-input border border-input bg-surface px-4 py-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ann-body-fr">{t('bodyFr')}</Label>
            <textarea
              id="ann-body-fr"
              value={bodyFr}
              required
              minLength={10}
              maxLength={4000}
              rows={4}
              disabled={submitting}
              onChange={(event) => setBodyFr(event.target.value)}
              className="w-full rounded-input border border-input bg-surface px-4 py-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <p className="text-xs text-muted-foreground">{t('bilingualHint')}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ann-audience">{t('audienceLabel')}</Label>
            <select
              id="ann-audience"
              value={audience}
              disabled={submitting}
              onChange={(event) => setAudience(event.target.value as AnnouncementAudience)}
              className="h-11 rounded-input border border-input bg-surface px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {ANNOUNCEMENT_AUDIENCES.map((value) => (
                <option key={value} value={value}>
                  {t(`audience.${value}`)}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 aria-hidden className="animate-spin" />}
              {submitting ? t('saving') : t('saveDraft')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
