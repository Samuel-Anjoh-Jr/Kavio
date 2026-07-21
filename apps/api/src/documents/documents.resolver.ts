import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, Public } from '../auth/decorators/auth.decorators';
import { DocumentsService } from './documents.service';
import { DocumentView } from './models/document.model';

/**
 * Document reads (TRU-08), GraphQL-only per the DUAL API RULE. Uploading is a
 * REST multipart write; retiring a document is a REST delete.
 *
 * Minting a signed URL is modelled as a read rather than an action because that
 * is what it is: no state changes, and the alternative — a REST endpoint that
 * hands out links — would put authorisation on a different code path from the
 * listing that shows the same files.
 */
@Resolver()
export class DocumentsResolver {
  constructor(private readonly documents: DocumentsService) {}

  @Query(() => [DocumentView], {
    description:
      'The signed-in identity’s own Documents area, newest first, excluding retired files (TRU-08).',
  })
  async myDocuments(@CurrentUser() user: AuthenticatedUser): Promise<DocumentView[]> {
    return this.documents.listOwn(user.id);
  }

  /**
   * Public only in the sense that the guard does not reject guests — the ACCESS
   * decision is made per document inside the service, and a guest gets nothing
   * but PUBLIC portfolio media. Guests need this to view worker portfolios with
   * no account (ACC-01); everything private still 404s for them.
   */
  @Public()
  @Query(() => DocumentView, {
    description:
      'One document with a short-lived signed URL. Owner and authorised staff only for private media; staff reads are audit-logged (NFR-SEC-04, NFR-SEC-05).',
  })
  async document(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() viewer: AuthenticatedUser | undefined,
  ): Promise<DocumentView> {
    return this.documents.findForViewer(id, viewer);
  }
}
