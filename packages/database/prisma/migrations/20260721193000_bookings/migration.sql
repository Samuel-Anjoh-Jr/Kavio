-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPT 60 — Bookings: accepted quote → agreement → escrow initiation
-- (QTE-03, QTE-04, PAY-01 init)
--
-- A booking is the agreement itself: this worker, this client, this price. It is
-- created the instant a quote is accepted, and it is the row the escrow state
-- machine (P62-P65) will move money against.
--
-- WHY THE MONEY COLUMNS ARE SNAPSHOTS. `platformFeeBps` records the fee rate
-- that was shown to the client BEFORE they paid (~10%, SRS §21), and both
-- amounts are computed once from it. Deriving the fee at payout time from
-- whatever the current rate happens to be would silently re-price an agreement
-- both parties already made — the one class of bug a marketplace is never
-- forgiven for. Storing the payout too means a change to the rounding rule
-- cannot retroactively alter what a worker was promised either.
--
-- WHY THE FULL BookingStatus ENUM LANDS NOW. This prompt implements only the
-- entry state (PENDING_PAYMENT + an escrow-initiation event). The remaining
-- states are still declared here so the set a booking can reach is ONE closed
-- list rather than two that drift apart between this module and payments.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM (
    'PENDING_PAYMENT',
    'PAID',
    'IN_PROGRESS',
    'COMPLETED',
    'RELEASED',
    'CANCELLED',
    'REFUNDED',
    'DISPUTED'
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "agreedPrice" INTEGER NOT NULL,
    "platformFeeBps" INTEGER NOT NULL,
    "platformFeeAmount" INTEGER NOT NULL,
    "workerPayoutAmount" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "escrowInitiatedAt" TIMESTAMP(3),
    "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingStatusEvent" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus" NOT NULL,
    "actorId" UUID,
    "note" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- ONE booking per quote, in the database rather than in a service check: a
-- double-tap on a bad Douala connection is the normal way this endpoint gets
-- called twice, and two agreements for one offer is two escrow holds.
CREATE UNIQUE INDEX "Booking_quoteId_key" ON "Booking"("quoteId");
CREATE INDEX "Booking_workerId_status_createdAt_idx" ON "Booking"("workerId", "status", "createdAt");
CREATE INDEX "Booking_clientId_status_createdAt_idx" ON "Booking"("clientId", "status", "createdAt");
CREATE INDEX "Booking_jobId_idx" ON "Booking"("jobId");
-- The reconciliation sweep against Campay webhooks (P65).
CREATE INDEX "Booking_status_createdAt_idx" ON "Booking"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BookingStatusEvent_bookingId_createdAt_idx" ON "BookingStatusEvent"("bookingId", "createdAt");

-- CHECK constraints on the money, because arithmetic is the thing worth being
-- paranoid about here. These are invariants of the agreement, not validation of
-- an input: the DTO can reject a negative price, but only the database can
-- promise that no row ever existed where the fee and the payout failed to add
-- back up to what the client agreed to pay.
ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_amounts_check"
    CHECK (
        "agreedPrice" > 0
        AND "platformFeeBps" BETWEEN 0 AND 10000
        AND "platformFeeAmount" >= 0
        AND "workerPayoutAmount" >= 0
        AND "platformFeeAmount" + "workerPayoutAmount" = "agreedPrice"
    );

-- AddForeignKey
-- RESTRICT throughout: a booking is a financial record. Deleting a job, a quote
-- or either party out from under one must fail loudly rather than cascade away
-- the evidence of an agreement that money moved against.
ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_quoteId_fkey"
    FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_workerId_fkey"
    FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingStatusEvent"
    ADD CONSTRAINT "BookingStatusEvent_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingStatusEvent"
    ADD CONSTRAINT "BookingStatusEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
