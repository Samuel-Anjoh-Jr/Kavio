import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../../lib/zod-validation.pipe';
import { campayWebhookSchema, type CampayWebhookDto } from './dto/campay-webhook.dto';
import { CampayWebhookService } from './campay-webhook.service';

/**
 * Campay webhook receiver (PAY-06). @Public — Campay posts without our auth — but
 * that is not "unauthenticated": every payload's signature is verified against the
 * app webhook key before it can move a franc, and settlement is idempotent on our
 * external reference, so a replayed or forged POST is safe.
 *
 * Always answers 200 on a well-formed, verified payload (even a duplicate), so
 * Campay stops retrying; a bad signature is the one thing that gets a 401.
 */
@Controller('webhooks/campay')
export class CampayWebhookController {
  constructor(private readonly webhook: CampayWebhookService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(@Body(new ZodValidationPipe(campayWebhookSchema)) payload: CampayWebhookDto) {
    return this.webhook.handleWebhook(payload);
  }
}
