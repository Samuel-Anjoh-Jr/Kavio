-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPTS 62-66, 68 — Payments, Wallet, Escrow & Disputes
-- (PAY-01…PAY-06, ADM-05; SRS §15)
--
-- The money layer. Four invariants are enforced HERE, at the database, because
-- arithmetic and idempotency are exactly the things a service check is not
-- allowed to be the last line of defence on:
--
--   • A wallet balance can never go negative      (Wallet_balance_check)
--   • An escrow's fee + payout always equal the held amount
--                                                 (EscrowHold_amounts_check)
--   • A Campay reference confirms at most once     (unique campayReference)
--   • A booking carries at most one OPEN dispute    (partial unique index)
--
-- BookingStatus gains ACCEPTED so a booking mirrors the EscrowHold money machine
-- one-for-one from PAID onward; MediaAssetKind gains DISPUTE_EVIDENCE for the
-- files attached to a dispute thread. Both are appended (Postgres ADD VALUE only
-- appends), keeping the enum order stable across deploys.
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterEnum: appended, never reordered (see MediaAssetKind note in schema.prisma).
ALTER TYPE "BookingStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "MediaAssetKind" ADD VALUE 'DISPUTE_EVIDENCE';

-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('MTN_MOMO', 'ORANGE_MONEY', 'CARD', 'BANK');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM (
    'DEPOSIT',
    'PAYMENT',
    'ESCROW_HOLD',
    'ESCROW_RELEASE',
    'FEE',
    'REFUND',
    'WITHDRAWAL'
);

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "TransactionDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "EscrowState" AS ENUM (
    'PAID',
    'ACCEPTED',
    'IN_PROGRESS',
    'COMPLETED',
    'RELEASED',
    'REFUNDED',
    'DISPUTED'
);

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'ESCALATED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DisputeResolution" AS ENUM (
    'RELEASE_TO_WORKER',
    'REFUND_TO_CLIENT',
    'REQUEST_INFO',
    'CLOSE_NO_ACTION'
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "PaymentMethodType" NOT NULL,
    "label" TEXT NOT NULL,
    "phone" TEXT,
    "maskedAccount" TEXT,
    "operator" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "direction" "TransactionDirection" NOT NULL,
    "amount" INTEGER NOT NULL,
    "bookingId" UUID,
    "escrowHoldId" UUID,
    "paymentMethodId" UUID,
    "campayReference" TEXT,
    "externalReference" TEXT,
    "failureReason" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscrowHold" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "feeAmount" INTEGER NOT NULL,
    "payoutAmount" INTEGER NOT NULL,
    "state" "EscrowState" NOT NULL DEFAULT 'PAID',
    "campayCollectionRef" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "disputedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscrowHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscrowStatusEvent" (
    "id" UUID NOT NULL,
    "escrowHoldId" UUID NOT NULL,
    "fromState" "EscrowState",
    "toState" "EscrowState" NOT NULL,
    "actorId" UUID,
    "note" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscrowStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "escrowHoldId" UUID,
    "openedById" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" "DisputeResolution",
    "resolutionNote" TEXT,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeMessage" (
    "id" UUID NOT NULL,
    "disputeId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeAttachment" (
    "id" UUID NOT NULL,
    "disputeMessageId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "availableBalance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentMethod_userId_isActive_idx" ON "PaymentMethod"("userId", "isActive");
-- Exactly one default method per user: a partial unique, so many non-default
-- methods coexist but a second default is rejected by the database.
CREATE UNIQUE INDEX "PaymentMethod_userId_default_key" ON "PaymentMethod"("userId") WHERE "isDefault";

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_campayReference_key" ON "Transaction"("campayReference");
CREATE UNIQUE INDEX "Transaction_externalReference_key" ON "Transaction"("externalReference");
CREATE INDEX "Transaction_userId_type_createdAt_idx" ON "Transaction"("userId", "type", "createdAt");
CREATE INDEX "Transaction_userId_status_createdAt_idx" ON "Transaction"("userId", "status", "createdAt");
CREATE INDEX "Transaction_bookingId_idx" ON "Transaction"("bookingId");
CREATE INDEX "Transaction_status_createdAt_idx" ON "Transaction"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EscrowHold_bookingId_key" ON "EscrowHold"("bookingId");
CREATE INDEX "EscrowHold_clientId_state_idx" ON "EscrowHold"("clientId", "state");
CREATE INDEX "EscrowHold_workerId_state_idx" ON "EscrowHold"("workerId", "state");
CREATE INDEX "EscrowHold_state_updatedAt_idx" ON "EscrowHold"("state", "updatedAt");

-- CreateIndex
CREATE INDEX "EscrowStatusEvent_escrowHoldId_createdAt_idx" ON "EscrowStatusEvent"("escrowHoldId", "createdAt");

-- CreateIndex
CREATE INDEX "Dispute_bookingId_idx" ON "Dispute"("bookingId");
CREATE INDEX "Dispute_status_createdAt_idx" ON "Dispute"("status", "createdAt");
CREATE INDEX "Dispute_jobId_idx" ON "Dispute"("jobId");
-- One live dispute per booking: a booking may be disputed again after a
-- resolution, but never carry two open disputes at once.
CREATE UNIQUE INDEX "Dispute_bookingId_open_key" ON "Dispute"("bookingId") WHERE "status" <> 'RESOLVED';

-- CreateIndex
CREATE INDEX "DisputeMessage_disputeId_createdAt_idx" ON "DisputeMessage"("disputeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DisputeAttachment_disputeMessageId_mediaAssetId_key" ON "DisputeAttachment"("disputeMessageId", "mediaAssetId");
CREATE INDEX "DisputeAttachment_mediaAssetId_idx" ON "DisputeAttachment"("mediaAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CHECK constraints — the money invariants the ledger is not allowed to break.
ALTER TABLE "Transaction"
    ADD CONSTRAINT "Transaction_amount_check" CHECK ("amount" > 0);

ALTER TABLE "EscrowHold"
    ADD CONSTRAINT "EscrowHold_amounts_check"
    CHECK (
        "amount" > 0
        AND "feeAmount" >= 0
        AND "payoutAmount" >= 0
        AND "feeAmount" + "payoutAmount" = "amount"
    );

ALTER TABLE "Wallet"
    ADD CONSTRAINT "Wallet_balance_check" CHECK ("availableBalance" >= 0);

-- AddForeignKey
ALTER TABLE "PaymentMethod"
    ADD CONSTRAINT "PaymentMethod_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL on the optional links: a transaction is a permanent ledger row and
-- must survive the soft-removal of a payment method or the archival of a booking,
-- keeping the history readable even when what it pointed at is gone.
ALTER TABLE "Transaction"
    ADD CONSTRAINT "Transaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Transaction"
    ADD CONSTRAINT "Transaction_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Transaction"
    ADD CONSTRAINT "Transaction_escrowHoldId_fkey"
    FOREIGN KEY ("escrowHoldId") REFERENCES "EscrowHold"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Transaction"
    ADD CONSTRAINT "Transaction_paymentMethodId_fkey"
    FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT: an escrow hold is a financial record; a party or the booking cannot be
-- deleted out from under held money.
ALTER TABLE "EscrowHold"
    ADD CONSTRAINT "EscrowHold_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EscrowHold"
    ADD CONSTRAINT "EscrowHold_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EscrowHold"
    ADD CONSTRAINT "EscrowHold_workerId_fkey"
    FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowStatusEvent"
    ADD CONSTRAINT "EscrowStatusEvent_escrowHoldId_fkey"
    FOREIGN KEY ("escrowHoldId") REFERENCES "EscrowHold"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EscrowStatusEvent"
    ADD CONSTRAINT "EscrowStatusEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute"
    ADD CONSTRAINT "Dispute_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Dispute"
    ADD CONSTRAINT "Dispute_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Dispute"
    ADD CONSTRAINT "Dispute_escrowHoldId_fkey"
    FOREIGN KEY ("escrowHoldId") REFERENCES "EscrowHold"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Dispute"
    ADD CONSTRAINT "Dispute_openedById_fkey"
    FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Dispute"
    ADD CONSTRAINT "Dispute_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeMessage"
    ADD CONSTRAINT "DisputeMessage_disputeId_fkey"
    FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DisputeMessage"
    ADD CONSTRAINT "DisputeMessage_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeAttachment"
    ADD CONSTRAINT "DisputeAttachment_disputeMessageId_fkey"
    FOREIGN KEY ("disputeMessageId") REFERENCES "DisputeMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DisputeAttachment"
    ADD CONSTRAINT "DisputeAttachment_mediaAssetId_fkey"
    FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet"
    ADD CONSTRAINT "Wallet_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
