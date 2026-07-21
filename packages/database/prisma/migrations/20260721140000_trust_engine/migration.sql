-- Trust Engine (SRS §6 TRU-*, §21.4 tiers, §21.5 point model, §21.6 pillars).
-- Adds the append-only trust ledger, its derived score snapshot, the progressive
-- verification checks + documents they are decided on, community endorsements,
-- and the admin-tunable tier gates.

-- CreateEnum
CREATE TYPE "TrustPillar" AS ENUM ('IDENTITY', 'PROFESSIONAL', 'MARKETPLACE', 'FINANCIAL');

-- CreateEnum
CREATE TYPE "TrustEventType" AS ENUM ('ACCOUNT_CREATED', 'PHONE_VERIFIED', 'ID_VERIFIED', 'FIELD_VERIFIED', 'PORTFOLIO_ADDED', 'JOB_COMPLETED', 'REPEAT_CUSTOMER', 'EXCELLENT_REVIEW', 'DISPUTE_UPHELD', 'JOB_CANCELLED', 'FAKE_DOCUMENTS_CONFIRMED', 'ENDORSEMENT_RECEIVED');

-- CreateEnum
CREATE TYPE "VerificationCheckType" AS ENUM ('PHONE', 'ID_SUBMITTED', 'ID_APPROVED', 'SELFIE_LIVENESS', 'ADDRESS', 'PORTFOLIO', 'FIELD_VERIFICATION', 'BUSINESS_REGISTRATION');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('NATIONAL_ID_FRONT', 'NATIONAL_ID_BACK', 'SELFIE', 'PROOF_OF_ADDRESS', 'CERTIFICATE', 'PORTFOLIO_IMAGE', 'BUSINESS_REGISTRATION');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('PRIVATE', 'STAFF_ONLY', 'PUBLIC');

-- CreateEnum
CREATE TYPE "EndorsementRelationship" AS ENUM ('PREVIOUS_CUSTOMER', 'WORKSHOP_OWNER', 'QUARTER_CHIEF', 'LANDLORD', 'COMMUNITY_LEADER', 'COLLEAGUE');

-- CreateEnum
CREATE TYPE "EndorsementStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "TrustEvent" (
    "id" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "type" "TrustEventType" NOT NULL,
    "pillar" "TrustPillar" NOT NULL,
    "delta" INTEGER NOT NULL,
    "actorId" UUID,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustScore" (
    "id" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "identityScore" INTEGER NOT NULL DEFAULT 0,
    "professionalScore" INTEGER NOT NULL DEFAULT 0,
    "marketplaceScore" INTEGER NOT NULL DEFAULT 0,
    "financialScore" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "suspendedAt" TIMESTAMP(3),
    "suspensionReason" TEXT,
    "completedJobs" INTEGER NOT NULL DEFAULT 0,
    "averageRating" DECIMAL(3,2),
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrustScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationRecord" (
    "id" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "checkType" "VerificationCheckType" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" UUID,
    "reason" TEXT,
    "metadata" JSONB,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "s3Key" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'PRIVATE',
    "reviewerId" UUID,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Endorsement" (
    "id" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "authorId" UUID,
    "authorName" TEXT,
    "relationship" "EndorsementRelationship" NOT NULL,
    "quote" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "status" "EndorsementStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Endorsement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TierConfig" (
    "id" UUID NOT NULL,
    "tier" "VerificationTier" NOT NULL,
    "minScore" INTEGER NOT NULL DEFAULT 0,
    "requiredChecks" "VerificationCheckType"[],
    "minCompletedJobs" INTEGER,
    "minAverageRating" DECIMAL(3,2),
    "labelKey" TEXT NOT NULL,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TierConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrustEvent_subjectId_occurredAt_idx" ON "TrustEvent"("subjectId", "occurredAt");

-- CreateIndex
CREATE INDEX "TrustEvent_subjectId_type_idx" ON "TrustEvent"("subjectId", "type");

-- CreateIndex
CREATE INDEX "TrustEvent_actorId_createdAt_idx" ON "TrustEvent"("actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrustScore_subjectId_key" ON "TrustScore"("subjectId");

-- CreateIndex
CREATE INDEX "TrustScore_total_idx" ON "TrustScore"("total");

-- CreateIndex
CREATE INDEX "TrustScore_suspended_idx" ON "TrustScore"("suspended");

-- CreateIndex
CREATE INDEX "VerificationRecord_subjectId_checkType_createdAt_idx" ON "VerificationRecord"("subjectId", "checkType", "createdAt");

-- CreateIndex
CREATE INDEX "VerificationRecord_status_createdAt_idx" ON "VerificationRecord"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_s3Key_key" ON "Document"("s3Key");

-- CreateIndex
CREATE INDEX "Document_ownerId_kind_createdAt_idx" ON "Document"("ownerId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "Document_status_createdAt_idx" ON "Document"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Endorsement_subjectId_status_createdAt_idx" ON "Endorsement"("subjectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Endorsement_authorId_idx" ON "Endorsement"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "TierConfig_tier_key" ON "TierConfig"("tier");

-- AddForeignKey
ALTER TABLE "TrustEvent" ADD CONSTRAINT "TrustEvent_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustEvent" ADD CONSTRAINT "TrustEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustScore" ADD CONSTRAINT "TrustScore_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRecord" ADD CONSTRAINT "VerificationRecord_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRecord" ADD CONSTRAINT "VerificationRecord_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Endorsement" ADD CONSTRAINT "Endorsement_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Endorsement" ADD CONSTRAINT "Endorsement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- The trust ledger is APPEND-ONLY (TRU-01). Convention alone is not enough for a
-- table that decides who gets paid work, so the database refuses the operations
-- outright: a correction is a new compensating event, never an edited history.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "trustevent_append_only"() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'TrustEvent is append-only: % is not permitted. Record a compensating event instead.', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TrustEvent_no_update"
    BEFORE UPDATE ON "TrustEvent"
    FOR EACH ROW EXECUTE FUNCTION "trustevent_append_only"();

CREATE TRIGGER "TrustEvent_no_delete"
    BEFORE DELETE ON "TrustEvent"
    FOR EACH ROW EXECUTE FUNCTION "trustevent_append_only"();

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed the tier gates exactly as SRS §21.4 states them. These are DEFAULTS, not
-- constants: an admin retunes them at runtime and the boundary moves on the next
-- recompute. Seeded in the migration (not the seed script) so tier derivation is
-- correct on a freshly deployed database, and ON CONFLICT DO NOTHING so a
-- re-deploy never overwrites values an admin has since tuned.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "TierConfig" ("id", "tier", "minScore", "requiredChecks", "minCompletedJobs", "minAverageRating", "labelKey", "createdAt", "updatedAt")
VALUES
    -- Tier 0 is the floor every new account starts on, so it gates on nothing.
    -- Its profile requirements (name, profession, photo, bio) are onboarding
    -- completeness (TRU-05), not verification, and are enforced there.
    (gen_random_uuid(), 'TIER_0', 0, ARRAY[]::"VerificationCheckType"[], NULL, NULL, 'trust.tier.basic', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'TIER_1', 0, ARRAY['PHONE', 'ID_SUBMITTED']::"VerificationCheckType"[], NULL, NULL, 'trust.tier.phone_id_submitted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'TIER_2', 0, ARRAY['ID_APPROVED', 'PORTFOLIO']::"VerificationCheckType"[], NULL, NULL, 'trust.tier.id_approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'TIER_3', 0, ARRAY['FIELD_VERIFICATION']::"VerificationCheckType"[], 20, 4.80, 'trust.tier.field_verified', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("tier") DO NOTHING;
