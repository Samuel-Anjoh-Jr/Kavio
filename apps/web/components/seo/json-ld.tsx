/**
 * Renders a JSON-LD `<script>` (SYS-05).
 *
 * A server component with no interactivity — it emits one tag. The `<` escape is
 * the one security measure that matters here: our own copy and admin-authored
 * FAQ text flow into this, and a literal `</script>` inside any string would
 * otherwise close the block early and let everything after it parse as markup.
 * Escaping `<` to its unicode form neutralises that without changing what a JSON
 * parser (or a crawler) reads.
 *
 * It is deliberately NOT `next/script`: structured data must be in the initial
 * server HTML for a crawler that does not run JavaScript, which is most of them
 * and every AI training crawler.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}
