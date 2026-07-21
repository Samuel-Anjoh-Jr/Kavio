'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@apollo/client/react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RADIUS_STEPS_M } from '@/lib/geo';
import {
  SEARCH_FILTER_RANGES_QUERY,
  type SearchFilterRangesQueryResult,
} from '@/lib/graphql/discovery';
import {
  activeFilterCount,
  clearFilters,
  SORT_OPTIONS,
  type SearchFilters,
  type SortOption,
  type VerificationTier,
} from '@/lib/search-filters';
import { cn } from '@/lib/utils';

/**
 * The filter drawer (DIS-07).
 *
 * ── Every control is derived from live data ─────────────────────────────────
 * Bounds come from `searchFilterRanges`, never from constants. A price slider
 * offering 0–1 000 000 FCFA in an area where every listing is under 30 000 is a
 * control that mostly does nothing, and a rating filter in an area where nobody
 * has been rated can only ever return an empty list — so it is not rendered at
 * all there. A filter that cannot succeed is worse than a missing filter,
 * because the user blames themselves for the empty result.
 *
 * ── Draft, then apply ───────────────────────────────────────────────────────
 * Edits are held locally and committed on Apply. Live-applying each change
 * would fire a search per keystroke of a price field and, worse, reshuffle the
 * results underneath somebody who is still deciding.
 */

const TIER_OPTIONS: VerificationTier[] = ['TIER_1', 'TIER_2', 'TIER_3'];
const DAYS = [0, 1, 2, 3, 4, 5, 6];

export function FilterDrawer({
  filters,
  onApply,
  className,
}: {
  filters: SearchFilters;
  onApply: (filters: SearchFilters) => void;
  className?: string;
}) {
  const t = useTranslations('Filters');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SearchFilters>(filters);

  // Re-sync when the URL changes underneath the drawer — a shared link, a Back
  // navigation, or a chip tapped outside it. Adjusted during render rather than
  // in an effect: an effect would paint one frame of the stale draft first, and
  // React re-runs this component before committing anything.
  const [appliedFilters, setAppliedFilters] = useState(filters);
  if (filters !== appliedFilters) {
    setAppliedFilters(filters);
    setDraft(filters);
  }

  const { data } = useQuery<SearchFilterRangesQueryResult>(SEARCH_FILTER_RANGES_QUERY, {
    variables: {
      latitude: filters.latitude,
      longitude: filters.longitude,
      radiusM: filters.latitude !== null ? filters.radiusM : undefined,
    },
    fetchPolicy: 'cache-first',
  });

  const ranges = data?.searchFilterRanges;
  const appliedCount = activeFilterCount(filters);

  function set<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function apply() {
    onApply(draft);
    setOpen(false);
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="outline" className={cn('gap-2', className)}>
          <SlidersHorizontal aria-hidden />
          {t('title')}
          {appliedCount > 0 && (
            <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 font-numeric text-xs font-semibold text-primary-foreground">
              {appliedCount}
            </span>
          )}
        </Button>
      </DrawerTrigger>

      <DrawerContent className="max-h-[92dvh]">
        <div className="mx-auto flex w-full max-w-lg flex-col overflow-y-auto px-4 pb-4">
          <DrawerHeader className="px-0">
            <DrawerTitle>{t('title')}</DrawerTitle>
            <DrawerDescription>
              {ranges
                ? t('scopeDescription', { count: ranges.workerCount })
                : t('scopeDescriptionLoading')}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col gap-6">
            {/* Categories carry live counts, so picking one is an informed choice
                rather than a guess that might empty the list. */}
            {ranges && ranges.categories.length > 0 && (
              <fieldset>
                <legend className="text-sm font-medium text-foreground">{t('category')}</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ranges.categories.map((category) => {
                    const active = draft.categorySlug === category.slug;
                    return (
                      <button
                        key={category.categoryId}
                        type="button"
                        aria-pressed={active}
                        onClick={() => set('categorySlug', active ? null : category.slug)}
                        className={cn(
                          'rounded-button border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active
                            ? 'border-primary bg-primary/10 font-medium text-primary'
                            : 'border-input bg-surface text-surface-foreground hover:bg-muted',
                        )}
                      >
                        {locale === 'fr' ? category.nameFr : category.nameEn}
                        <span className="ml-2 font-numeric text-xs text-muted-foreground">
                          {category.workerCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {/* Radius only exists when there is an origin to measure from. */}
            {draft.latitude !== null && (
              <fieldset>
                <legend className="text-sm font-medium text-foreground">{t('radius')}</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {RADIUS_STEPS_M.map((radius) => {
                    const active = draft.radiusM === radius;
                    return (
                      <button
                        key={radius}
                        type="button"
                        aria-pressed={active}
                        onClick={() => set('radiusM', radius)}
                        className={cn(
                          'rounded-button border px-3 py-2 font-numeric text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active
                            ? 'border-primary bg-primary/10 font-medium text-primary'
                            : 'border-input bg-surface text-surface-foreground hover:bg-muted',
                        )}
                      >
                        {t('kilometres', { value: String(radius / 1000) })}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {/* Priced listings only. Where nothing carries a price, a price
                filter would silently exclude every "ask" listing. */}
            {ranges && ranges.price.pricedServiceCount > 0 && (
              <fieldset>
                <legend className="text-sm font-medium text-foreground">{t('price')}</legend>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('priceHint', {
                    min: String(ranges.price.min ?? 0),
                    max: String(ranges.price.max ?? 0),
                  })}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="filter-price-min">{t('priceMin')}</Label>
                    <Input
                      id="filter-price-min"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder={String(ranges.price.p25 ?? ranges.price.min ?? 0)}
                      value={draft.minPrice ?? ''}
                      onChange={(event) =>
                        set(
                          'minPrice',
                          event.target.value === '' ? null : Number(event.target.value),
                        )
                      }
                      className="mt-1 font-numeric"
                    />
                  </div>
                  <div>
                    <Label htmlFor="filter-price-max">{t('priceMax')}</Label>
                    <Input
                      id="filter-price-max"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder={String(ranges.price.p75 ?? ranges.price.max ?? 0)}
                      value={draft.maxPrice ?? ''}
                      onChange={(event) =>
                        set(
                          'maxPrice',
                          event.target.value === '' ? null : Number(event.target.value),
                        )
                      }
                      className="mt-1 font-numeric"
                    />
                  </div>
                </div>
              </fieldset>
            )}

            <fieldset>
              <legend className="text-sm font-medium text-foreground">{t('trust')}</legend>

              <label className="mt-3 flex items-center gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={draft.verifiedOnly}
                  onChange={(event) => set('verifiedOnly', event.target.checked)}
                  className="size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                />
                <span>
                  {t('verifiedOnly')}
                  {ranges && (
                    <span className="ml-2 font-numeric text-xs text-muted-foreground">
                      {t('available', { count: ranges.verifiedWorkerCount })}
                    </span>
                  )}
                </span>
              </label>

              <div className="mt-4">
                <Label htmlFor="filter-trust-score">
                  {t('minTrustScore', { value: String(draft.minTrustScore ?? 0) })}
                </Label>
                <input
                  id="filter-trust-score"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={draft.minTrustScore ?? 0}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    set('minTrustScore', value === 0 ? null : value);
                  }}
                  className="mt-2 w-full accent-primary"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {TIER_OPTIONS.map((tier) => {
                  const active = draft.minTier === tier;
                  return (
                    <button
                      key={tier}
                      type="button"
                      aria-pressed={active}
                      onClick={() => set('minTier', active ? null : tier)}
                      className={cn(
                        'rounded-button border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active
                          ? 'border-primary bg-primary/10 font-medium text-primary'
                          : 'border-input bg-surface text-surface-foreground hover:bg-muted',
                      )}
                    >
                      {t('minTier', { tier: t(`tier.${tier}`) })}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Rating is hidden where nobody has been rated: the control could
                only ever return nothing, and the user would blame the filter. */}
            {ranges && ranges.ratedWorkerCount > 0 && (
              <fieldset>
                <legend className="text-sm font-medium text-foreground">{t('rating')}</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[3, 4, 4.5].map((rating) => {
                    const active = draft.minRating === rating;
                    return (
                      <button
                        key={rating}
                        type="button"
                        aria-pressed={active}
                        onClick={() => set('minRating', active ? null : rating)}
                        className={cn(
                          'rounded-button border px-3 py-2 font-numeric text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active
                            ? 'border-primary bg-primary/10 font-medium text-primary'
                            : 'border-input bg-surface text-surface-foreground hover:bg-muted',
                        )}
                      >
                        {t('ratingOption', { value: String(rating) })}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <fieldset>
              <legend className="text-sm font-medium text-foreground">{t('availability')}</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {DAYS.map((day) => {
                  const active = draft.availableDay === day;
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={active}
                      onClick={() => set('availableDay', active ? null : day)}
                      className={cn(
                        'rounded-button border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active
                          ? 'border-primary bg-primary/10 font-medium text-primary'
                          : 'border-input bg-surface text-surface-foreground hover:bg-muted',
                      )}
                    >
                      {t(`day.${day}`)}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium text-foreground">{t('sort')}</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {SORT_OPTIONS.map((option: SortOption) => {
                  const active = draft.sort === option;
                  // Sorting by distance without an origin would silently do
                  // nothing, so it is disabled rather than offered.
                  const disabled = option === 'distance' && draft.latitude === null;

                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={disabled}
                      aria-pressed={active}
                      onClick={() => set('sort', option)}
                      className={cn(
                        'rounded-button border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                        active
                          ? 'border-primary bg-primary/10 font-medium text-primary'
                          : 'border-input bg-surface text-surface-foreground hover:bg-muted',
                      )}
                    >
                      {t(`sortOption.${option}`)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>

          {/* Sticky so the count and the way out stay reachable on a phone
              without scrolling back up through eight filter groups. */}
          <div className="sticky bottom-0 -mx-4 mt-6 flex gap-3 border-t border-border bg-surface px-4 py-4">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setDraft(clearFilters(draft))}
              disabled={activeFilterCount(draft) === 0}
            >
              {t('clear')}
            </Button>
            <Button className="flex-1" onClick={apply}>
              {t('apply', { count: activeFilterCount(draft) })}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
