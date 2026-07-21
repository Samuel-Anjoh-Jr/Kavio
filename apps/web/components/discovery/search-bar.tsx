'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@apollo/client/react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  SERVICE_CATEGORIES_QUERY,
  type ServiceCategoriesQueryResult,
  type ServiceCategorySummary,
} from '@/lib/graphql/discovery';
import { cn } from '@/lib/utils';

/**
 * The search bar with category suggestions (DIS-04, DIS-05).
 *
 * Suggestions are drawn from the ADMIN-CONFIGURED TAXONOMY, not from free text.
 * That is the requirement, and it is also what stops the box from being a
 * dead end: "electrician" is a category we can search well, and offering the
 * category rather than the raw string is how a typo still finds somebody.
 *
 * The fuzzy matching that decides RESULTS happens in PostgreSQL (pg_trgm). The
 * matching here is only choosing which of a few dozen already-loaded category
 * names to suggest — a substring test, not a second search engine.
 */

function categoryName(category: ServiceCategorySummary, locale: string): string {
  return locale === 'fr' ? category.nameFr : category.nameEn;
}

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  /** Fires when a suggestion is chosen — the caller applies the category filter. */
  onSelectCategory?: (category: ServiceCategorySummary) => void;
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

export function SearchBar({
  value,
  onChange,
  onSelectCategory,
  onSubmit,
  placeholder,
  autoFocus = false,
  className,
}: SearchBarProps) {
  const t = useTranslations('Search');
  const locale = useLocale();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const { data } = useQuery<ServiceCategoriesQueryResult>(SERVICE_CATEGORIES_QUERY, {
    // The taxonomy changes when an admin edits it, not while somebody types.
    fetchPolicy: 'cache-first',
  });

  const suggestions = useMemo(() => {
    const categories = data?.serviceCategories ?? [];
    const needle = value.trim().toLocaleLowerCase();
    if (needle.length < 2) return [];

    return categories
      .filter((category) => {
        // Both languages are matched regardless of UI locale: people search for
        // "plombier" on an English interface here all the time.
        const haystack = `${category.nameEn} ${category.nameFr}`.toLocaleLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, 6);
  }, [data?.serviceCategories, value]);

  const showList = open && suggestions.length > 0;

  function choose(category: ServiceCategorySummary) {
    onSelectCategory?.(category);
    onChange(categoryName(category, locale));
    setOpen(false);
    setActiveIndex(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList) {
      if (event.key === 'Enter') onSubmit?.();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = suggestions[activeIndex];
      if (chosen) choose(chosen);
      else onSubmit?.();
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 && suggestions[activeIndex]
              ? `${listId}-${suggestions[activeIndex].id}`
              : undefined
          }
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder ?? t('placeholder')}
          aria-label={t('label')}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          // Delayed so a click on a suggestion lands before the list unmounts.
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="pl-11 pr-11"
        />

        {value.length > 0 && (
          <button
            type="button"
            aria-label={t('clear')}
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden className="size-4" />
          </button>
        )}
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('suggestionsLabel')}
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-card border border-border bg-surface shadow-lg"
        >
          {suggestions.map((category, index) => (
            <li
              key={category.id}
              id={`${listId}-${category.id}`}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(category)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors',
                  index === activeIndex ? 'bg-muted' : 'hover:bg-muted',
                )}
              >
                <span className="truncate text-foreground">{categoryName(category, locale)}</span>
                {/* The count is the honest part of a suggestion: it tells you
                    whether picking it will find anyone before you pick it. */}
                <span className="shrink-0 font-numeric text-xs text-muted-foreground">
                  {t('workerCount', { count: category.workerCount })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
