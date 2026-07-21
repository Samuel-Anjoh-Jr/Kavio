-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPT 27 — Document upload and secure storage (TRU-06 storage, TRU-08, NFR-SEC-04)
--
-- Part 1 of 2. This migration only ADDS: the two enum values and the columns the
-- reconciliation needs. Postgres refuses to USE an enum value in the same
-- transaction that adds it, and Prisma applies each migration file in one
-- transaction — so the data migration that writes PROOF_OF_ADDRESS and
-- CERTIFICATE rows lives in the next migration, not this one.
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterEnum
-- Appended, never reordered: ALTER TYPE ... ADD VALUE can only append, so the
-- schema file keeps this order too or the next deploy reports drift.
ALTER TYPE "MediaAssetKind" ADD VALUE 'PROOF_OF_ADDRESS';
ALTER TYPE "MediaAssetKind" ADD VALUE 'CERTIFICATE';

-- AlterTable
-- `checksum` proves the object under review is the object that was uploaded, and
-- makes "this ID has already been submitted under another account" a cheap query.
-- `deletedAt` is a soft delete: a user may retire a document, but bytes behind a
-- check that granted a tier must survive for the audit trail.
ALTER TABLE "MediaAsset" ADD COLUMN "checksum" TEXT;
ALTER TABLE "MediaAsset" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "MediaAsset_ownerId_deletedAt_idx" ON "MediaAsset"("ownerId", "deletedAt");
CREATE INDEX "MediaAsset_checksum_idx" ON "MediaAsset"("checksum");
