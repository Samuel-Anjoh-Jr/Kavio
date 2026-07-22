-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPT 79 — Reviews (REV-01, REV-02, REV-03)
--
-- Reviews are the Marketplace pillar's main input, which is exactly what makes
-- them worth forging. Two constraints in this file are the anti-fabrication
-- guarantee, and neither is decorative:
--
--   Review_jobId_authorId_key   One review per person per job. The service checks
--                               that the author is a participant in a COMPLETED
--                               booking; this index is what holds when two taps
--                               on a bad connection race each other.
--
--   Review_rating_check         1–5, in the database. The Trust Engine reads this
--                               column, so a 7 must be impossible rather than
--                               merely unexpected by whatever wrote it.
--
-- Moderation HIDES rather than deletes (ReviewStatus.HIDDEN): a hidden review
-- stops counting toward the average and has its trust event revoked, but the row
-- and its history survive — a subject must not be able to make an inconvenient
-- review disappear, and an admin must be able to say later what came down and why.
--
-- EXCELLENT_REVIEW_REVOKED joins the trust ledger here. The point model already
-- had REVOCATION as a general rule kind (written for endorsements, documented as
-- "a shape disputes and reversed reviews will need too"); this is that shape's
-- second user, so hiding a review withdraws its points by appending a negation
-- rather than by deleting the row that granted them.
--
-- REVIEW_PHOTO is its own MediaAssetKind, NOT PORTFOLIO_IMAGE: this is the
-- client's photo of delivered work, and the Trust Engine pays a worker for their
-- own portfolio evidence. Reusing the kind would let a client's snapshot inflate
-- the Professional sub-score of the person they were reviewing.
--
-- Reporting is deliberately absent: reports live in AbuseReport with
-- targetType = REVIEW so one moderation workspace covers every reportable
-- surface (ADM-08), rather than reviews carrying a private queue of their own.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN');

-- AlterEnum
-- Appended, never reordered: ALTER TYPE ... ADD VALUE can only append, so the
-- enum's order in schema.prisma must match the order migrations added values.
ALTER TYPE "MediaAssetKind" ADD VALUE 'REVIEW_PHOTO';

-- AlterEnum
ALTER TYPE "TrustEventType" ADD VALUE 'EXCELLENT_REVIEW_REVOKED';

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "hiddenReason" TEXT,
    "moderatedById" UUID,
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewPhoto" (
    "id" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The anti-fabrication guarantee (REV-02): one engagement, one review per party.
CREATE UNIQUE INDEX "Review_jobId_authorId_key" ON "Review"("jobId", "authorId");
-- The profile Reviews tab: a subject's visible reviews, newest first.
CREATE INDEX "Review_subjectId_status_createdAt_idx" ON "Review"("subjectId", "status", "createdAt");
-- "Have I already reviewed this?" on the author's completed-jobs list.
CREATE INDEX "Review_authorId_createdAt_idx" ON "Review"("authorId", "createdAt");
CREATE INDEX "Review_bookingId_idx" ON "Review"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewPhoto_reviewId_mediaAssetId_key" ON "ReviewPhoto"("reviewId", "mediaAssetId");
CREATE INDEX "ReviewPhoto_reviewId_sortOrder_idx" ON "ReviewPhoto"("reviewId", "sortOrder");
CREATE INDEX "ReviewPhoto_mediaAssetId_idx" ON "ReviewPhoto"("mediaAssetId");

-- CHECK constraint — the range the Trust Engine depends on.
ALTER TABLE "Review"
    ADD CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5);

-- A review is about the OTHER party. Self-review is not a state the eligibility
-- check can reach, and a row that reached it anyway would quietly let an identity
-- pay itself Marketplace points.
ALTER TABLE "Review"
    ADD CONSTRAINT "Review_parties_check" CHECK ("authorId" <> "subjectId");

-- AddForeignKey
-- RESTRICT on the job and the booking: a review is evidence about a completed
-- engagement, and the engagement must not be deletable out from under it.
ALTER TABLE "Review"
    ADD CONSTRAINT "Review_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Review"
    ADD CONSTRAINT "Review_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CASCADE on the parties: deleting an identity removes the reviews it wrote and
-- the reviews written about it, which is what a deletion request has to mean.
ALTER TABLE "Review"
    ADD CONSTRAINT "Review_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Review"
    ADD CONSTRAINT "Review_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Review"
    ADD CONSTRAINT "Review_moderatedById_fkey"
    FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewPhoto"
    ADD CONSTRAINT "ReviewPhoto_reviewId_fkey"
    FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReviewPhoto"
    ADD CONSTRAINT "ReviewPhoto_mediaAssetId_fkey"
    FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
