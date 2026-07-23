import { JsonLd } from '@/components/seo/json-ld';
import { canonicalFor } from '@/lib/seo';
import { breadcrumbNode, graph, webPageNode } from '@/lib/structured-data';

/**
 * Shared chrome + content loader for the three legal pages (SRS §26.6).
 *
 * A plain typographic column, deliberately calm — a legal page is for reading,
 * not for motion. Every legal namespace is shaped identically
 * (`{ title, updated, intro, sections: [{ heading, body: [...] }] }`), so one
 * component renders all three and the EN/FR catalogues stay structurally
 * identical by construction (SYS-03).
 *
 * It also emits the page's structured data: a WebPage tied into the site graph
 * plus a BreadcrumbList. Breadcrumbs are worth the few lines — they render as a
 * path in search results (better than a bare URL) and give an answer engine the
 * page's place in the site, both from content that is genuinely on the page.
 */

export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalCopy {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

export function LegalPage({
  copy,
  locale,
  path,
  homeLabel,
}: {
  copy: LegalCopy;
  locale: string;
  /** Locale-stripped path, e.g. `/legal/terms`. */
  path: string;
  /** Translated label for the breadcrumb root. */
  homeLabel: string;
}) {
  const url = canonicalFor(locale, path);

  const structuredData = graph([
    webPageNode({
      locale,
      url,
      title: copy.title,
      description: copy.intro,
      breadcrumbId: `${url}#breadcrumb`,
    }),
    breadcrumbNode({
      locale,
      url,
      items: [
        { name: homeLabel, path: '/' },
        { name: copy.title, path },
      ],
    }),
  ]);

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-16 sm:px-6">
      <JsonLd data={structuredData} />

      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold text-foreground sm:text-4xl">
          {copy.title}
        </h1>
        <p className="text-sm text-muted-foreground">{copy.updated}</p>
      </header>

      <p className="text-balance text-muted-foreground">{copy.intro}</p>

      <div className="flex flex-col gap-8">
        {copy.sections.map((section, i) => (
          <section key={i} className="flex flex-col gap-3">
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {section.heading}
            </h2>
            {section.body.map((paragraph, j) => (
              <p key={j} className="leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}
