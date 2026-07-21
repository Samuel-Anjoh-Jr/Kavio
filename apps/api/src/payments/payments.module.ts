import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { CampayService } from './campay/campay.service';
import { DisputesController } from './disputes/disputes.controller';
import { DisputesService } from './disputes/disputes.service';
import { EscrowInitiationListener } from './escrow/escrow-initiation.listener';
import { EscrowPaymentService } from './escrow/escrow-payment.service';
import { EscrowController } from './escrow/escrow.controller';
import { EscrowService } from './escrow/escrow.service';
import { LedgerService } from './ledger.service';
import { PaymentMethodsController } from './payment-methods/payment-methods.controller';
import { PaymentMethodsService } from './payment-methods/payment-methods.service';
import { PaymentsNotificationListener } from './payments-notification.listener';
import { PaymentsReadService } from './payments-read.service';
import { PaymentsResolver } from './payments.resolver';
import { WalletController } from './wallet/wallet.controller';
import { WalletService } from './wallet/wallet.service';
import { CampayWebhookController } from './webhooks/campay-webhook.controller';
import { CampayWebhookService } from './webhooks/campay-webhook.service';
import { ReconciliationController } from './webhooks/reconciliation.controller';

/**
 * Payments, Wallet, Escrow & Disputes (PROMPTS 62-66, 68; SRS §15, PAY-*, ADM-05).
 *
 * Imports JobsModule because the escrow machine DRIVES the job lifecycle: work
 * starting, completing, releasing and refunding are the same events on the job
 * board and in the ledger, so escrow transitions run the job state machine
 * JobsService owns rather than a second copy of the rules. StorageModule resolves
 * signed URLs for dispute evidence on read.
 *
 * The module consumes the ESCROW_INITIATION_REQUESTED seam QuotesModule left open
 * (a booking is created, money must now be collected) via EscrowInitiationListener.
 */
@Module({
  imports: [PrismaModule, JobsModule, StorageModule],
  controllers: [
    PaymentMethodsController,
    WalletController,
    EscrowController,
    DisputesController,
    CampayWebhookController,
    ReconciliationController,
  ],
  providers: [
    CampayService,
    LedgerService,
    PaymentMethodsService,
    EscrowService,
    EscrowPaymentService,
    WalletService,
    CampayWebhookService,
    DisputesService,
    PaymentsReadService,
    PaymentsResolver,
    EscrowInitiationListener,
    PaymentsNotificationListener,
  ],
  exports: [EscrowService, LedgerService],
})
export class PaymentsModule {}
