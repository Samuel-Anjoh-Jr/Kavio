import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';
import { DisputeStatus, TransactionStatus, TransactionType } from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/decorators/auth.decorators';
import {
  AdminDisputeView,
  DisputeView,
  EscrowView,
  PaymentMethodView,
  TransactionView,
  WalletView,
} from './models/payments.model';
import { PaymentsReadService } from './payments-read.service';

/**
 * Payments READS (GraphQL, per the DUAL API RULE; PAY-05, PAY-06). Every write is
 * on the REST controllers.
 *
 * Nothing here is @Public(): a wallet, a ledger and an escrow timeline are
 * financial records. Each query resolves only rows the viewer is a party to —
 * enforced in the service's WHERE, not merely by the field being authenticated.
 */
@Resolver()
export class PaymentsResolver {
  constructor(private readonly read: PaymentsReadService) {}

  @Query(() => WalletView, {
    description: 'The wallet overview: balance, in-escrow, pending payout, last movement (PAY-05).',
  })
  async wallet(@CurrentUser() user: AuthenticatedUser): Promise<WalletView> {
    return this.read.wallet(user);
  }

  @Query(() => [PaymentMethodView], { description: 'The caller’s saved payment methods (PAY-04).' })
  async paymentMethods(@CurrentUser() user: AuthenticatedUser): Promise<PaymentMethodView[]> {
    return this.read.paymentMethods(user);
  }

  @Query(() => [TransactionView], {
    description: 'The caller’s transaction history, filterable by type and status (PAY-05).',
  })
  async transactions(
    @CurrentUser() user: AuthenticatedUser,
    @Args('type', { type: () => TransactionType, nullable: true }) type?: TransactionType,
    @Args('status', { type: () => TransactionStatus, nullable: true }) status?: TransactionStatus,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<TransactionView[]> {
    return this.read.transactions(user, { type, status, limit, offset });
  }

  @Query(() => TransactionView, {
    nullable: true,
    description: 'One transaction’s detail, scoped to the owner (PAY-05).',
  })
  async transaction(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<TransactionView | null> {
    return this.read.transaction(user, id);
  }

  @Query(() => EscrowView, {
    nullable: true,
    description: 'The escrow timeline for a booking the caller is a party to (PAY-01, PAY-02).',
  })
  async escrow(
    @CurrentUser() user: AuthenticatedUser,
    @Args('bookingId', { type: () => ID }) bookingId: string,
  ): Promise<EscrowView | null> {
    return this.read.escrow(user, bookingId);
  }

  @Query(() => DisputeView, {
    description: 'One dispute, visible to its parties (PAY-03).',
  })
  async dispute(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<DisputeView> {
    return this.read.dispute(user, id);
  }

  /** The admin dispute queue (ADM-05). */
  @RequirePermissions('admin:dispute_resolve')
  @Query(() => [DisputeView], { description: 'The admin dispute queue (ADM-05).' })
  async disputeQueue(
    @Args('status', { type: () => DisputeStatus, nullable: true }) status?: DisputeStatus,
  ): Promise<DisputeView[]> {
    return this.read.disputeQueue(status);
  }

  /**
   * The full admin dispute workspace (ADM-05): details, parties, the frozen
   * escrow, the thread with evidence, and the combined money-plus-case history.
   * Admin-gated, and NOT party-scoped — an admin resolving a case is not one of
   * its sides.
   */
  @RequirePermissions('admin:dispute_resolve')
  @Query(() => AdminDisputeView, {
    description: 'The admin dispute workspace: details, messages, evidence and history (ADM-05).',
  })
  async adminDispute(@Args('id', { type: () => ID }) id: string): Promise<AdminDisputeView> {
    return this.read.adminDispute(id);
  }
}
