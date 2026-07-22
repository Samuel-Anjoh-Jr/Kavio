import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import { adjustTrustScoreSchema, type AdjustTrustScoreDto } from './dto/trust-adjustment.dto';
import { TrustAdjustmentService } from './trust-adjustment.service';

/**
 * Admin Trust Score writes (REST, per the DUAL API RULE; ADM-04).
 *
 * `admin:trust_adjust` is its OWN permission, held only by ADMIN — not folded
 * into `admin:verification_review`. Deciding a document and moving a score by
 * hand are different powers with different blast radii, and an agent who can
 * clear the verification queue must not thereby be able to hand out or dock
 * points. The RBAC catalogue already separates them; this route honours that.
 */
@Controller('admin/trust')
export class TrustAdminController {
  constructor(private readonly adjustments: TrustAdjustmentService) {}

  /**
   * Applies an exceptional Trust Score adjustment via an explicit TrustEvent
   * (ADM-04). The score is never edited — the event is appended and the ledger
   * replayed, so the change is auditable and reversible by construction.
   */
  @Post('adjustments')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('admin:trust_adjust')
  async adjust(
    @CurrentUser() admin: AuthenticatedUser,
    @Body(new ZodValidationPipe(adjustTrustScoreSchema)) dto: AdjustTrustScoreDto,
  ) {
    return this.adjustments.adjust(admin, dto.subjectId, dto.delta, dto.reason);
  }
}
