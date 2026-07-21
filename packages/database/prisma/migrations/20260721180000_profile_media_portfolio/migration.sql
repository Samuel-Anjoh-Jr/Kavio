-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPTS 46-48 — Profile media and portfolio grouping (PRO-01, PRO-02, PRO-06)
--
-- Three small additions the profile screens need and the catalog schema
-- (PROMPT 37) did not yet carry:
--
--   1. A cover image on WorkerProfile and a logo on BusinessProfile, both as
--      MediaAsset foreign keys rather than URL columns. A URL column would be
--      the one path into the system that skips upload validation, ownership and
--      signed access — every other file goes through MediaAsset, so these do too.
--
--   2. Before/after and project grouping on PortfolioItem. `groupKey` already
--      tied items together; what was missing was WHICH SIDE of a pair an item is
--      and what the project is called.
--
--   3. A WORKER_COVER media kind. Deliberately not reusing PORTFOLIO_IMAGE: the
--      Trust Engine scores portfolio uploads as evidence of work performed
--      (PORTFOLIO_ADDED), and a decorative banner earning trust points would be
--      a scoring bug with no obvious symptom.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "PortfolioSlot" AS ENUM ('BEFORE', 'AFTER');

-- AlterEnum
-- Postgres can only APPEND to an enum, which is why MediaAssetKind's order is
-- treated as immutable in schema.prisma.
ALTER TYPE "MediaAssetKind" ADD VALUE 'WORKER_COVER';

-- AlterTable
ALTER TABLE "WorkerProfile" ADD COLUMN "coverAssetId" UUID;

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN "logoAssetId" UUID;

-- AlterTable
ALTER TABLE "PortfolioItem"
    ADD COLUMN "projectTitle" TEXT,
    ADD COLUMN "slot" "PortfolioSlot",
    ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
-- ON DELETE SET NULL, not CASCADE: deleting the image should cost the profile
-- its cover, never the profile itself.
ALTER TABLE "WorkerProfile"
    ADD CONSTRAINT "WorkerProfile_coverAssetId_fkey"
    FOREIGN KEY ("coverAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessProfile"
    ADD CONSTRAINT "BusinessProfile_logoAssetId_fkey"
    FOREIGN KEY ("logoAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
-- The gallery read path: one worker's portfolio in the order they chose.
CREATE INDEX "PortfolioItem_workerProfileId_sortOrder_idx" ON "PortfolioItem"("workerProfileId", "sortOrder");
