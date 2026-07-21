-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPTS 27-32 — Verification pipeline, endorsements and badges
--
--   P27  Document/MediaAsset reconciliation (TRU-08, NFR-SEC-04)
--   P28  Verification records + friendly retries (TRU-06, TRU-07, TRU-08)
--   P29  Review pipeline for agents/admins (AGT-02, AGT-03, ADM-03)
--   P30  Community endorsements, capped + tapering (TRU-10)
--   P31  Founding Professional intake (TRU-09, AGT-01)
--   P32  Milestone badges and trust history (TRU-11)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- P27. Fold `Document` into `MediaAsset`.
--
-- Two tables covered the same storage ground (owner, key, mime, size,
-- visibility) because the trust and profile work landed in separate commits.
-- MediaAsset wins as the storage record; review state moves onto the CHECK a
-- file was submitted for (VerificationRecord) and reaches the file through
-- VerificationDocument below — so one upload can back several checks and carry a
-- different outcome in each.
--
-- Rows are copied before the drop. Nothing in the API ever wrote `Document`, so
-- this is expected to move zero rows on every existing database; it is written
-- anyway because "expected to be empty" is not a thing to bet a KYC table on.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "MediaAsset" ("id", "ownerId", "kind", "s3Key", "mimeType", "sizeBytes", "visibility", "createdAt")
SELECT
    "id",
    "ownerId",
    -- Every DocumentKind has an identically-named MediaAssetKind member.
    "kind"::TEXT::"MediaAssetKind",
    "s3Key",
    -- MediaAsset requires both; Document allowed either to be null.
    COALESCE("mimeType", 'application/octet-stream'),
    COALESCE("sizeBytes", 0),
    -- STAFF_ONLY collapses to PRIVATE: MediaVisibility draws the line at "needs a
    -- signed URL", and who may obtain one is an access decision made at read
    -- time, not a column.
    CASE WHEN "visibility" = 'PUBLIC' THEN 'PUBLIC'::"MediaVisibility" ELSE 'PRIVATE'::"MediaVisibility" END,
    "createdAt"
FROM "Document"
ON CONFLICT ("s3Key") DO NOTHING;

-- DropTable
DROP TABLE "Document";

-- DropEnum
DROP TYPE "DocumentKind";
DROP TYPE "DocumentStatus";
DROP TYPE "DocumentVisibility";

-- ─────────────────────────────────────────────────────────────────────────────
-- P28/P29. Verification records grow a review pipeline.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
-- `stage` is the operational queue position; `status` stays the three-valued
-- outcome the tier gates read. Keeping them apart means workflow churn never
-- leaks into the scoring contract.
CREATE TYPE "VerificationStage" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'FIELD_CHECK', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
-- A code, not a sentence: the friendly-retry copy (TRU-07) is localized EN/FR in
-- the web catalogue and must never be English typed into a column by a reviewer.
CREATE TYPE "VerificationRejectionReason" AS ENUM ('OCR_UNREADABLE', 'DOCUMENT_EXPIRED', 'DETAILS_MISMATCH', 'INCOMPLETE_SUBMISSION', 'WRONG_DOCUMENT_TYPE', 'FIELD_CHECK_FAILED', 'SUSPECTED_FRAUD', 'CONFIRMED_FRAUDULENT', 'OTHER');

-- AlterTable
ALTER TABLE "VerificationRecord" ADD COLUMN "stage" "VerificationStage" NOT NULL DEFAULT 'SUBMITTED';
ALTER TABLE "VerificationRecord" ADD COLUMN "stageUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "VerificationRecord" ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "VerificationRecord" ADD COLUMN "assignedToId" UUID;
ALTER TABLE "VerificationRecord" ADD COLUMN "rejectionReason" "VerificationRejectionReason";
ALTER TABLE "VerificationRecord" ADD COLUMN "infoRequest" TEXT;
ALTER TABLE "VerificationRecord" ADD COLUMN "infoRequestedAt" TIMESTAMP(3);

-- Any record already decided predates the pipeline; park it in the terminal
-- stage that matches its outcome so the board is not misleading on day one.
UPDATE "VerificationRecord" SET "stage" = 'APPROVED' WHERE "status" = 'VERIFIED';
UPDATE "VerificationRecord" SET "stage" = 'REJECTED' WHERE "status" = 'REJECTED';

-- CreateTable
-- Evidence for a check. Many-to-many in both directions on purpose: an ID check
-- needs front AND back, and one selfie can back both liveness and a field visit.
CREATE TABLE "VerificationDocument" (
    "id" UUID NOT NULL,
    "verificationRecordId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Append-only transition log. The per-stage counts, average review time and
-- approval rate (AGT-03) are computed from this: the record's current stage
-- alone cannot answer "how long does review take" once an item moves twice.
CREATE TABLE "VerificationStageEvent" (
    "id" UUID NOT NULL,
    "verificationRecordId" UUID NOT NULL,
    "fromStage" "VerificationStage",
    "toStage" "VerificationStage" NOT NULL,
    "actorId" UUID,
    "note" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationStageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificationRecord_stage_submittedAt_idx" ON "VerificationRecord"("stage", "submittedAt");
CREATE INDEX "VerificationRecord_assignedToId_stage_idx" ON "VerificationRecord"("assignedToId", "stage");
CREATE UNIQUE INDEX "VerificationDocument_verificationRecordId_mediaAssetId_key" ON "VerificationDocument"("verificationRecordId", "mediaAssetId");
CREATE INDEX "VerificationDocument_mediaAssetId_idx" ON "VerificationDocument"("mediaAssetId");
CREATE INDEX "VerificationStageEvent_verificationRecordId_createdAt_idx" ON "VerificationStageEvent"("verificationRecordId", "createdAt");
CREATE INDEX "VerificationStageEvent_toStage_createdAt_idx" ON "VerificationStageEvent"("toStage", "createdAt");

-- AddForeignKey
ALTER TABLE "VerificationRecord" ADD CONSTRAINT "VerificationRecord_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VerificationDocument" ADD CONSTRAINT "VerificationDocument_verificationRecordId_fkey" FOREIGN KEY ("verificationRecordId") REFERENCES "VerificationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationDocument" ADD CONSTRAINT "VerificationDocument_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationStageEvent" ADD CONSTRAINT "VerificationStageEvent_verificationRecordId_fkey" FOREIGN KEY ("verificationRecordId") REFERENCES "VerificationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationStageEvent" ADD CONSTRAINT "VerificationStageEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- The stage log is append-only for the same reason the trust ledger is: it is
-- the evidence behind "an agent approved this at 14:02", and review metrics
-- computed over an editable table are decoration rather than measurement.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "verificationstageevent_append_only"() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'VerificationStageEvent is append-only: % is not permitted. Record the corrective transition instead.', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "VerificationStageEvent_no_update"
    BEFORE UPDATE ON "VerificationStageEvent"
    FOR EACH ROW EXECUTE FUNCTION "verificationstageevent_append_only"();

CREATE TRIGGER "VerificationStageEvent_no_delete"
    BEFORE DELETE ON "VerificationStageEvent"
    FOR EACH ROW EXECUTE FUNCTION "verificationstageevent_append_only"();

-- ─────────────────────────────────────────────────────────────────────────────
-- P30. Endorsements: moderation trail, revocation, one per author per subject.
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterEnum
-- Withdrawing influence from an append-only ledger is an appended NEGATION, not
-- a deletion — the history still shows the endorsement was given and taken back.
ALTER TYPE "TrustEventType" ADD VALUE 'ENDORSEMENT_REVOKED';

-- AlterTable
ALTER TABLE "Endorsement" ADD COLUMN "reviewedById" UUID;
ALTER TABLE "Endorsement" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "Endorsement" ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "Endorsement" ADD COLUMN "revokedAt" TIMESTAMP(3);

-- CreateIndex
-- One endorsement per author per subject. NULL author ids repeat freely under
-- Postgres NULL semantics, which is right: an off-platform endorsement is
-- vouched for by the capturing agent, not deduplicated by identity.
CREATE UNIQUE INDEX "Endorsement_subjectId_authorId_key" ON "Endorsement"("subjectId", "authorId");
CREATE INDEX "Endorsement_status_createdAt_idx" ON "Endorsement"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Endorsement" ADD CONSTRAINT "Endorsement_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- P32. Milestone badges (TRU-11).
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "BadgeType" AS ENUM ('FOUNDING_PROFESSIONAL', 'IDENTITY_VERIFIED', 'VERIFIED_PROFESSIONAL', 'FIELD_VERIFIED_PROFESSIONAL', 'TRUST_SCORE_25', 'TRUST_SCORE_50', 'TRUST_SCORE_75', 'TRUST_SCORE_90', 'FIRST_JOB', 'JOBS_10', 'JOBS_25', 'JOBS_50', 'JOBS_100', 'COMMUNITY_ENDORSED');

-- CreateTable
-- Milestones are PERMANENT: a Trust Score that later dips does not un-ring the
-- bell. The badge records that the thing happened, not that it is still true —
-- which is why the tier (which demotes) and the tier badge are separate rows.
CREATE TABLE "UserBadge" (
    "id" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "type" "BadgeType" NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "metadata" JSONB,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The unique constraint IS the idempotency guarantee: a replayed event can
-- neither double-award nor re-notify.
CREATE UNIQUE INDEX "UserBadge_subjectId_type_key" ON "UserBadge"("subjectId", "type");
CREATE INDEX "UserBadge_subjectId_awardedAt_idx" ON "UserBadge"("subjectId", "awardedAt");

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
