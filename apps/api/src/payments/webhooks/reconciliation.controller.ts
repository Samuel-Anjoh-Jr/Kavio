import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { RequirePermissions } from '../../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../../lib/zod-validation.pipe';
import { z } from 'zod';
import { CampayWebhookService } from './campay-webhook.service';

const reconcileSchema = z.object({
  /** Reconcile a single transaction by our external reference; omit to sweep. */
  externalReference: z.string().min(1).optional(),
});
type ReconcileDto = z.infer<typeof reconcileSchema>;

/**
 * Manual reconciliation (PAY-06, NFR-AVAIL-02). The safety net for a webhook that
 * never arrived after a transient failure: an admin (or a scheduler calling this
 * with `admin:payment_manage`) polls Campay for the authoritative status and
 * settles through the same idempotent path the webhook uses.
 */
@Controller('admin/payments')
export class ReconciliationController {
  constructor(private readonly webhook: CampayWebhookService) {}

  @Post('reconcile')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('admin:payment_manage')
  async reconcile(@Body(new ZodValidationPipe(reconcileSchema)) dto: ReconcileDto) {
    if (dto.externalReference) {
      return this.webhook.reconcile(dto.externalReference);
    }
    return this.webhook.reconcilePending();
  }
}
