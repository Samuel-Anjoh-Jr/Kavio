-- Sponsored ranking placement (business plan: "Featured/Verified Business
-- tier"). Held on the IDENTITY, alongside tier and Trust Score, so a role
-- switch never re-verifies and never re-prices a commercial grant either.

-- CreateEnum
CREATE TYPE "FeaturedListingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'REVOKED');

-- CreateTable
CREATE TABLE "FeaturedListing" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "FeaturedListingStatus" NOT NULL DEFAULT 'PENDING',
    "extraCommissionBps" INTEGER,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" UUID,
    "rejectionReason" TEXT,
    "reviewNote" TEXT,
    "pausedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastShownAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeaturedListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeaturedListing_userId_key" ON "FeaturedListing"("userId");
CREATE INDEX "FeaturedListing_status_idx" ON "FeaturedListing"("status");
-- The fairness rotation cursor for sponsored search slots (§4).
CREATE INDEX "FeaturedListing_status_lastShownAt_idx" ON "FeaturedListing"("status", "lastShownAt");

-- AddForeignKey
ALTER TABLE "FeaturedListing"
    ADD CONSTRAINT "FeaturedListing_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeaturedListing"
    ADD CONSTRAINT "FeaturedListing_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
