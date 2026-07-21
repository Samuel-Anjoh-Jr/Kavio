import { Controller, Delete, HttpCode, HttpStatus, Param, ParseUUIDPipe } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { DocumentsService } from './documents.service';

/**
 * Document writes (REST, per the DUAL API RULE). Uploading lives on
 * `POST /uploads`; this owns the destructive half.
 *
 * Authenticated by default via the global JwtAuthGuard, and ownership is checked
 * against the TOKEN inside the service — a path parameter never authorises
 * anything here.
 */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /**
   * Retires one of the caller's documents (TRU-08).
   *
   * Returns `purged: false` when the file was kept as evidence behind a
   * verification. The client says so plainly rather than implying the bytes are
   * gone — a KYC promise that is quietly untrue is worse than an honest one.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ id: string; purged: boolean }> {
    return this.documents.remove(id, user);
  }
}
