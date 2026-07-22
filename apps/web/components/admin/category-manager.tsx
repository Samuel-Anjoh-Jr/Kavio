'use client';

import { useState } from 'react';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { Archive, FolderTree, Loader2, Plus } from 'lucide-react';
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
import { useAuthErrorMessage } from '@/lib/auth-errors';
import { restPost } from '@/lib/rest-api';

/**
 * The service-category management surface (ADM-02), on top of PROMPT 43.
 *
 * Reads go through the SAME public taxonomy query search and job posting use,
 * with `includeInactive` for staff — the API enforces that flag against the
 * caller. Reading the taxonomy through an admin-only copy would give the
 * platform two taxonomies to keep in step, and the console would be the one that
 * drifted.
 *
 * There is no delete. A category that has ever scoped a job or a service is
 * RETIRED, so that history still resolves; the API has no delete endpoint to
 * call even if this screen offered one.
 */

const ADMIN_CATEGORIES_QUERY = gql`
  query AdminServiceCategories {
    serviceCategories(includeInactive: true) {
      id
      slug
      nameEn
      nameFr
      icon
      parentId
      sortOrder
      isActive
      workerCount
    }
  }
`;

interface AdminCategory {
  id: string;
  slug: string;
  nameEn: string;
  nameFr: string;
  icon: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  workerCount: number;
}

interface AdminCategoriesResult {
  serviceCategories: AdminCategory[];
}

export function CategoryManager() {
  const t = useTranslations('Admin');

  const { data, loading, error, refetch } = useQuery<AdminCategoriesResult>(
    ADMIN_CATEGORIES_QUERY,
    { fetchPolicy: 'cache-and-network', errorPolicy: 'all' },
  );

  const categories = data?.serviceCategories ?? [];
  const topLevel = categories.filter((category) => category.parentId === null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('categoriesCaption')}</p>
        <CategoryDialog categories={topLevel} onSaved={() => void refetch()} />
      </div>

      {loading && !data ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-16 w-full rounded-card" />
        </div>
      ) : error && categories.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-sm text-muted-foreground">
          {t('loadError')}
        </p>
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border py-14 text-center">
          <FolderTree aria-hidden className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{t('noCategories')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {topLevel.map((category) => (
            <li key={category.id} className="rounded-card border border-border bg-surface p-4">
              <CategoryRow category={category} onChanged={() => void refetch()} />

              {/* Specialisations, indented under their trade. The taxonomy is
                  two levels by design, so this never recurses further. */}
              {categories.some((child) => child.parentId === category.id) && (
                <ul className="mt-3 flex flex-col gap-2 border-l border-border pl-4">
                  {categories
                    .filter((child) => child.parentId === category.id)
                    .map((child) => (
                      <li key={child.id}>
                        <CategoryRow category={child} onChanged={() => void refetch()} />
                      </li>
                    ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryRow({ category, onChanged }: { category: AdminCategory; onChanged: () => void }) {
  const t = useTranslations('Admin');
  const translateError = useAuthErrorMessage();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retire() {
    setWorking(true);
    setError(null);
    try {
      await restPost(`admin/service-categories/${category.id}/retire`);
      onChanged();
    } catch (err) {
      setError(translateError(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{category.nameEn}</span>
            <span className="text-sm text-muted-foreground">· {category.nameFr}</span>
            {!category.isActive && <StatusBadge tone="neutral" size="sm" label={t('retired')} />}
          </div>
          <p className="mt-0.5 font-numeric text-xs text-muted-foreground">
            {category.slug} · {t('workerCount', { count: category.workerCount })}
          </p>
        </div>

        {category.isActive && (
          <Button variant="ghost" size="sm" disabled={working} onClick={() => void retire()}>
            {working ? <Loader2 aria-hidden className="animate-spin" /> : <Archive aria-hidden />}
            {t('retire')}
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function CategoryDialog({
  categories,
  onSaved,
}: {
  categories: AdminCategory[];
  onSaved: () => void;
}) {
  const t = useTranslations('Admin');
  const translateError = useAuthErrorMessage();

  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameFr, setNameFr] = useState('');
  const [parentId, setParentId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await restPost('admin/service-categories', {
        slug: slug.trim(),
        nameEn: nameEn.trim(),
        nameFr: nameFr.trim(),
        ...(parentId ? { parentId } : {}),
      });
      setOpen(false);
      setSlug('');
      setNameEn('');
      setNameFr('');
      setParentId('');
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
          {t('newCategory')}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('newCategoryTitle')}</DialogTitle>
          <DialogDescription>{t('newCategorySubtitle')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cat-slug">{t('slugLabel')}</Label>
            <Input
              id="cat-slug"
              value={slug}
              required
              pattern="[a-z0-9-]+"
              disabled={submitting}
              onChange={(event) => setSlug(event.target.value)}
            />
            {/* The slug is permanent because saved filters and job posts
                reference it — the API has no endpoint to change it. */}
            <p className="text-xs text-muted-foreground">{t('slugHint')}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cat-name-en">{t('nameEnLabel')}</Label>
              <Input
                id="cat-name-en"
                value={nameEn}
                required
                disabled={submitting}
                onChange={(event) => setNameEn(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cat-name-fr">{t('nameFrLabel')}</Label>
              <Input
                id="cat-name-fr"
                value={nameFr}
                required
                disabled={submitting}
                onChange={(event) => setNameFr(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cat-parent">{t('parentLabel')}</Label>
            <select
              id="cat-parent"
              value={parentId}
              disabled={submitting}
              onChange={(event) => setParentId(event.target.value)}
              className="h-11 rounded-input border border-input bg-surface px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <option value="">{t('noParent')}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nameEn}
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
              {submitting ? t('saving') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
