import { Fragment } from 'react';

/**
 * A deliberately tiny Markdown renderer for FAQ answers.
 *
 * FAQ answers are stored as Markdown (never as HTML — an admin-editable HTML
 * column is an XSS sink), so something has to render them. This supports
 * paragraphs, `**bold**`, `*italic*` and `[links](/path)` and NOTHING else.
 *
 * That is a choice, not a limitation to be grown out of. Pulling in a full
 * Markdown pipeline would add a parser plus a sanitiser to the critical path of
 * the landing page — the one page with a hard LCP budget (NFR-PERF-01) — to
 * support syntax nobody writing an FAQ answer needs. Crucially, this never
 * produces raw HTML: every node below is a React element, so admin-authored text
 * cannot inject markup no matter what it contains. If a real Markdown surface
 * ever appears, that is the moment to adopt a library, not to extend this.
 */

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;

/** Only in-app and absolute http(s) links; anything else renders as plain text. */
function safeHref(href: string): string | null {
  if (href.startsWith('/') || /^https?:\/\//i.test(href)) return href;
  return null;
}

function renderInline(text: string, keyPrefix: string) {
  return text.split(INLINE).map((chunk, i) => {
    const key = `${keyPrefix}-${i}`;

    if (chunk.startsWith('**') && chunk.endsWith('**')) {
      return <strong key={key}>{chunk.slice(2, -2)}</strong>;
    }

    if (chunk.startsWith('*') && chunk.endsWith('*') && chunk.length > 2) {
      return <em key={key}>{chunk.slice(1, -1)}</em>;
    }

    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(chunk);
    if (link) {
      const href = safeHref(link[2]!);
      if (!href) return <Fragment key={key}>{link[1]}</Fragment>;

      const external = /^https?:\/\//i.test(href);
      return (
        <a
          key={key}
          href={href}
          className="text-primary underline underline-offset-4 hover:no-underline"
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {link[1]}
        </a>
      );
    }

    return <Fragment key={key}>{chunk}</Fragment>;
  });
}

export function MarkdownText({ children }: { children: string }) {
  const paragraphs = children.split(/\n{2,}/).filter((p) => p.trim().length > 0);

  return (
    <>
      {paragraphs.map((paragraph, i) => (
        <p key={i} className={i > 0 ? 'mt-3' : undefined}>
          {renderInline(paragraph.trim(), `p${i}`)}
        </p>
      ))}
    </>
  );
}
