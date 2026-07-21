'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLazyQuery } from '@apollo/client/react';
import { Eye, FileWarning, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DOCUMENT_QUERY, type DocumentQueryResult } from '@/lib/graphql/documents';

/**
 * Secure KYC document viewer (ADM-03, NFR-SEC).
 *
 * The signed URL is fetched ON OPEN, never with the queue listing. Three reasons,
 * all of them the same reason:
 *
 *  - A signed URL is a bearer capability. Minting one per card on a board a
 *    reviewer merely scrolled past hands out dozens of live links to ID photos
 *    nobody looked at.
 *  - The server audit-logs staff document reads (NFR-SEC-05). That log is only
 *    meaningful if a read means a human actually opened the file.
 *  - The URLs are short-lived, so one minted at page load may well be dead by
 *    the time it is clicked.
 *
 * The URL is dropped from component state on close, and the image is rendered
 * with `referrerPolicy="no-referrer"` so the signed URL never leaks into a
 * third-party referer header.
 */
export function SecureDocumentViewer({
  documentIds,
  subjectName,
}: {
  documentIds: string[];
  subjectName: string | null;
}) {
  const t = useTranslations('ReviewBoard');
  const [openId, setOpenId] = useState<string | null>(null);

  const [fetchDocument, { data, loading, error }] = useLazyQuery<DocumentQueryResult>(
    DOCUMENT_QUERY,
    {
      // Never cache a KYC document: the signed URL expires, and a cached copy
      // would also survive in memory after the reviewer closed the dialog.
      fetchPolicy: 'no-cache',
    },
  );

  function open(id: string) {
    setOpenId(id);
    void fetchDocument({ variables: { id } });
  }

  const document = data?.document;
  const isImage = document?.mimeType?.startsWith('image/') ?? false;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {documentIds.map((id, index) => (
          <Button key={id} variant="outline" size="sm" onClick={() => open(id)}>
            <Eye aria-hidden className="size-3.5" />
            {t('viewDocument', { index: index + 1 })}
          </Button>
        ))}
      </div>

      <Dialog
        open={openId !== null}
        onOpenChange={(next) => {
          // Clearing the id drops the fetched URL from state along with it.
          if (!next) setOpenId(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('documentTitle')}</DialogTitle>
            <DialogDescription>
              {t('documentSubject', { name: subjectName ?? t('unnamedSubject') })}
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <p className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              {t('documentLoading')}
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-input bg-danger/10 p-4 text-sm text-danger"
            >
              <FileWarning aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t('documentError')}
            </p>
          )}

          {!loading && !error && document && (
            <div className="flex flex-col gap-3">
              {document.url && isImage && (
                // A signed, expiring URL on an arbitrary storage host cannot go
                // through next/image's optimizer: that would refetch the file
                // server-side and cache KYC bytes at the edge, which is exactly
                // what short-lived signed access exists to prevent.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={document.url}
                  alt={t('documentAlt', { kind: t(`documentKind.${document.kind}`) })}
                  referrerPolicy="no-referrer"
                  className="max-h-[60vh] w-full rounded-image object-contain"
                />
              )}

              {document.url && !isImage && (
                <Button asChild variant="outline">
                  <a href={document.url} target="_blank" rel="noreferrer noopener">
                    {t('documentOpen')}
                  </a>
                </Button>
              )}

              {/* Local development uses a storage driver with no HTTP surface. */}
              {!document.url && (
                <p className="rounded-input bg-muted p-4 text-sm text-muted-foreground">
                  {t('documentNoUrl')}
                </p>
              )}

              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">{t('documentKindLabel')}</dt>
                <dd className="text-foreground">{t(`documentKind.${document.kind}`)}</dd>
                <dt className="text-muted-foreground">{t('documentTypeLabel')}</dt>
                <dd className="font-numeric text-foreground">{document.mimeType}</dd>
              </dl>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
