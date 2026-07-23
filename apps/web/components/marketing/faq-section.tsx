'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Accordion, AccordionItem } from '@/components/ui/accordion';
import { EmptyState } from '@/components/system/empty-state';
import { localised, type FaqEntry } from '@/lib/graphql/marketing';
import { MarkdownText } from './markdown-text';

/**
 * The database-driven FAQ (SRS §26.2), rendered as the animated accordion the
 * requirement specifies.
 *
 * The entries come from the API, never from a hardcoded array — the whole point
 * of PROMPT 92.1. That also means this component has to handle an empty list
 * gracefully: a marketing page whose FAQ section renders as a bare heading over
 * nothing looks broken, so it renders a branded empty state instead (SYS-04).
 *
 * The first entry opens by default. It is the section's own affordance — a
 * column of identical closed rows does not read as "these expand" until one of
 * them has been opened.
 */
export function FaqSection({ faqs }: { faqs: FaqEntry[] }) {
  const t = useTranslations('Marketing.faq');
  const locale = useLocale();

  if (faqs.length === 0) {
    return <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />;
  }

  return (
    <Accordion>
      {faqs.map((faq, index) => (
        <AccordionItem
          key={faq.id}
          title={localised(faq, 'question', locale)}
          defaultOpen={index === 0}
        >
          <MarkdownText>{localised(faq, 'answer', locale)}</MarkdownText>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
