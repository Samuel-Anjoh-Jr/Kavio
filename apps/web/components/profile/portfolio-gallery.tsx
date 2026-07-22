'use client';

import { useTranslations } from 'next-intl';
import { Flag, ImageOff } from 'lucide-react';
import { RemoteImage } from '@/components/ui/remote-image';
import { ReportDialog } from '@/components/moderation/report-dialog';
import type { PortfolioGroup } from '@/lib/graphql/discovery';
import { BeforeAfter } from './before-after';

/**
 * Portfolio evidence, grouped by project (PRO-02).
 *
 * First-class, not a tab afterthought: "real photos of past projects" tied for
 * the top spot in the user survey (59.3%), ahead of verified ID. A group that
 * holds both halves of a pair renders as a comparison; everything else renders
 * as a plain gallery.
 *
 * Videos are rendered with `preload="none"` and a poster-less control surface —
 * this audience is on metered mobile data, and a page that silently pulls three
 * video files on open is a page they stop opening.
 */
export function PortfolioGallery({
  groups,
  workerUserId,
}: {
  groups: PortfolioGroup[];
  /** The owning identity, so an individual item can be reported (ADM-08). */
  workerUserId?: string;
}) {
  const t = useTranslations('Profile');

  const populated = groups.filter((group) => group.items.some((item) => item.url));

  if (populated.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
        <ImageOff aria-hidden className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('portfolioEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {populated.map((group, index) => {
        const before = group.items.find((item) => item.slot === 'BEFORE' && item.url);
        const after = group.items.find((item) => item.slot === 'AFTER' && item.url);

        if (group.isBeforeAfter && before?.url && after?.url) {
          return (
            <section key={group.groupKey ?? `group-${index}`}>
              {group.projectTitle && (
                <h3 className="mb-3 font-heading text-base font-semibold text-foreground">
                  {group.projectTitle}
                </h3>
              )}
              <BeforeAfter
                before={{ url: before.url, caption: before.caption }}
                after={{ url: after.url, caption: after.caption }}
                caption={after.caption ?? before.caption}
              />
            </section>
          );
        }

        return (
          <section key={group.groupKey ?? `group-${index}`}>
            {group.projectTitle && (
              <h3 className="mb-3 font-heading text-base font-semibold text-foreground">
                {group.projectTitle}
              </h3>
            )}

            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {group.items
                .filter((item) => item.url)
                .map((item) => (
                  <li key={item.id}>
                    <figure className="group/item relative">
                      {item.type === 'VIDEO' ? (
                        <video
                          src={item.url as string}
                          controls
                          preload="none"
                          aria-label={item.caption ?? t('portfolioVideoLabel')}
                          className="aspect-square w-full rounded-image bg-muted object-cover"
                        />
                      ) : (
                        <RemoteImage
                          src={item.url as string}
                          alt={item.caption ?? t('portfolioImageAlt')}
                          className="aspect-square w-full rounded-image object-cover"
                        />
                      )}

                      {/* Portfolio evidence is the top-ranked trust signal, which
                          makes a stolen photo one of the more damaging things
                          somebody can post — so each item is reportable on its
                          own, not just the profile as a whole (ADM-08).
                          Kept visible on focus, never hover-only, so it is
                          reachable by keyboard and on touch. */}
                      {workerUserId && (
                        <ReportDialog
                          targetType="PORTFOLIO_ITEM"
                          targetId={item.id}
                          reportedUserId={workerUserId}
                          trigger={
                            <button
                              type="button"
                              aria-label={t('reportItem')}
                              className="absolute right-1 top-1 rounded-full bg-background/85 p-1.5 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/item:opacity-100"
                            >
                              <Flag aria-hidden className="size-3.5" />
                            </button>
                          }
                        />
                      )}

                      {item.caption && (
                        <figcaption className="mt-1 truncate text-xs text-muted-foreground">
                          {item.caption}
                        </figcaption>
                      )}
                    </figure>
                  </li>
                ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
