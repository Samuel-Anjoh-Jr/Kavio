-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPT 59 — Quotes and negotiation (QTE-01, QTE-03, QTE-04)
--
-- The priced offer that becomes a contract. Two shapes here carry the whole
-- negotiation:
--
--   `parentQuoteId`  A revision is a NEW ROW chained to the one it supersedes,
--                    never an in-place edit. The price a client saw must stay
--                    retrievable exactly as they saw it — that is the artefact
--                    a dispute is argued over.
--
--   `counter*`       The client's counter-offer REQUEST (QTE-02) lives on the
--                    quote being countered rather than in a table of its own.
--                    A client asks; only the worker ever sets a price. Giving
--                    the request its own row would be the first step toward a
--                    client-authored quote, which is not what a quote is.
--
-- `includes` is a TEXT[] rather than a line-item table: an item has no identity,
-- is never referenced, reordered independently or priced separately. It is one
-- field of the offer, and a join table would only make it look otherwise.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
-- Exactly the six states QTE-03 names — no SUPERSEDED. A revised quote is
-- DECLINED with `supersededAt` set, which keeps the state contract the SRS's
-- while letting the UI label it "Revised" rather than the misleading "Declined".
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "QuoteDurationUnit" AS ENUM ('HOUR', 'DAY', 'WEEK');

-- AlterEnum
ALTER TYPE "MediaAssetKind" ADD VALUE 'QUOTE_ATTACHMENT';

-- CreateTable
CREATE TABLE "Quote" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "applicationId" UUID,
    "parentQuoteId" UUID,
    "price" INTEGER NOT NULL,
    "durationValue" INTEGER,
    "durationUnit" "QuoteDurationUnit",
    "includes" TEXT[],
    "message" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "counterRequestedAt" TIMESTAMP(3),
    "counterMessage" TEXT,
    "counterTargetPrice" INTEGER,
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteAttachment" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Quote_jobId_status_createdAt_idx" ON "Quote"("jobId", "status", "createdAt");
CREATE INDEX "Quote_workerId_status_createdAt_idx" ON "Quote"("workerId", "status", "createdAt");
-- The lazy expiry sweep: live quotes whose expiry has passed.
CREATE INDEX "Quote_status_expiresAt_idx" ON "Quote"("status", "expiresAt");
CREATE INDEX "Quote_parentQuoteId_idx" ON "Quote"("parentQuoteId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteAttachment_quoteId_mediaAssetId_key" ON "QuoteAttachment"("quoteId", "mediaAssetId");
CREATE INDEX "QuoteAttachment_quoteId_idx" ON "QuoteAttachment"("quoteId");

-- AddForeignKey
ALTER TABLE "Quote"
    ADD CONSTRAINT "Quote_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Quote"
    ADD CONSTRAINT "Quote_workerId_fkey"
    FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL: withdrawing the application it grew out of must not delete the
-- priced offer the client is currently looking at.
ALTER TABLE "Quote"
    ADD CONSTRAINT "Quote_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Quote"
    ADD CONSTRAINT "Quote_parentQuoteId_fkey"
    FOREIGN KEY ("parentQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteAttachment"
    ADD CONSTRAINT "QuoteAttachment_quoteId_fkey"
    FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuoteAttachment"
    ADD CONSTRAINT "QuoteAttachment_mediaAssetId_fkey"
    FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
