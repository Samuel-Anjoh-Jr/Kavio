-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPT 54 — Jobs and applications schema (SRS §6 JOB-*, §21.3 lifecycle)
--
-- The marketplace's demand side. A job is posted by a Client (or a Business
-- owner — same identity FK, same tier gate), scoped to the admin taxonomy, and
-- walks the §21.3 state machine from Draft to a terminal state.
--
-- Three things this migration is careful about:
--
--   1. THE FULL §21.3 ENUM, including REFUNDED. PROMPT 55's prose lists nine
--      states; the SRS state table gives Accepted → Refunded and Disputed →
--      Refunded as real exits. A money state the enum cannot express is one the
--      escrow module would have to invent again in Phase 5, so it lands here.
--
--   2. LOCATION IS THE SAME MACHINERY AS PROFILES. Plain latitude/longitude
--      columns for capture, a `trustpro_sync_location` trigger deriving the
--      geography, a partial GIST index for radius search. A second, subtly
--      different way of storing where something is would leave job proximity
--      and worker proximity disagreeing about the same city.
--
--   3. JobStatusEvent IS APPEND-ONLY. The current `status` cannot answer "when
--      did work actually start", which is both the JOB-06 timeline and the input
--      to every completion-rate signal the Trust Engine will want.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM (
    'DRAFT',
    'OPEN',
    'QUOTED',
    'ACCEPTED',
    'IN_PROGRESS',
    'COMPLETED',
    'RELEASED',
    'DISPUTED',
    'CANCELLED',
    'REFUNDED',
    'ARCHIVED'
);

-- CreateEnum
CREATE TYPE "JobUrgency" AS ENUM ('FLEXIBLE', 'WITHIN_WEEK', 'WITHIN_48_HOURS', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "JobApplicationStatus" AS ENUM (
    'SUBMITTED',
    'UNDER_REVIEW',
    'SHORTLISTED',
    'NOT_SELECTED',
    'HIRED',
    'WITHDRAWN'
);

-- AlterEnum
-- Postgres can only APPEND to an enum, which is why MediaAssetKind's order is
-- treated as immutable in schema.prisma. The value is added here and first USED
-- in application code, never in this transaction — Postgres forbids the latter.
ALTER TYPE "MediaAssetKind" ADD VALUE 'JOB_PHOTO';

-- CreateTable
CREATE TABLE "Job" (
    "id" UUID NOT NULL,
    "posterId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "urgency" "JobUrgency" NOT NULL DEFAULT 'FLEXIBLE',
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "city" TEXT,
    "area" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationSource" "LocationSource",
    "landmark" TEXT,
    "geoRegionId" UUID,
    "publishedAt" TIMESTAMP(3),
    "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- The authoritative position. Added outside the CREATE TABLE because Prisma
-- describes it as `Unsupported` and cannot emit it — see WorkerProfile.location.
ALTER TABLE "Job" ADD COLUMN "location" geography(Point, 4326);

COMMENT ON COLUMN "Job"."location" IS 'Derived from latitude/longitude by trustpro_sync_location. All spatial maths runs against THIS column.';

-- CreateTable
CREATE TABLE "JobPhoto" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobStatusEvent" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "fromStatus" "JobStatus",
    "toStatus" "JobStatus" NOT NULL,
    "actorId" UUID,
    "note" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "status" "JobApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "message" TEXT NOT NULL,
    "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_status_publishedAt_idx" ON "Job"("status", "publishedAt");
CREATE INDEX "Job_posterId_status_createdAt_idx" ON "Job"("posterId", "status", "createdAt");
CREATE INDEX "Job_categoryId_status_publishedAt_idx" ON "Job"("categoryId", "status", "publishedAt");
CREATE INDEX "Job_geoRegionId_status_idx" ON "Job"("geoRegionId", "status");

-- CreateIndex (GIST — the radius search behind a job board scoped to "near me")
-- Partial, like the profile indexes: a draft with no pin yet is not a point on
-- the map and does not belong in the index that answers spatial questions.
CREATE INDEX "Job_location_gist" ON "Job" USING GIST ("location") WHERE "location" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "JobPhoto_jobId_mediaAssetId_key" ON "JobPhoto"("jobId", "mediaAssetId");
CREATE INDEX "JobPhoto_jobId_sortOrder_idx" ON "JobPhoto"("jobId", "sortOrder");

-- CreateIndex
CREATE INDEX "JobStatusEvent_jobId_createdAt_idx" ON "JobStatusEvent"("jobId", "createdAt");
CREATE INDEX "JobStatusEvent_toStatus_createdAt_idx" ON "JobStatusEvent"("toStatus", "createdAt");

-- CreateIndex
-- One application per worker per job: a worker with second thoughts revises the
-- one they have. Re-applying to shout louder is not a feature.
CREATE UNIQUE INDEX "JobApplication_jobId_workerId_key" ON "JobApplication"("jobId", "workerId");
CREATE INDEX "JobApplication_jobId_status_createdAt_idx" ON "JobApplication"("jobId", "status", "createdAt");
CREATE INDEX "JobApplication_workerId_status_createdAt_idx" ON "JobApplication"("workerId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "Job"
    ADD CONSTRAINT "Job_posterId_fkey"
    FOREIGN KEY ("posterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ON DELETE RESTRICT: the taxonomy is retired, never deleted (there is no delete
-- endpoint at all). A delete reaching here means something has gone wrong
-- upstream, and silently orphaning live jobs would hide it.
ALTER TABLE "Job"
    ADD CONSTRAINT "Job_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Job"
    ADD CONSTRAINT "Job_geoRegionId_fkey"
    FOREIGN KEY ("geoRegionId") REFERENCES "GeoRegion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPhoto"
    ADD CONSTRAINT "JobPhoto_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobPhoto"
    ADD CONSTRAINT "JobPhoto_mediaAssetId_fkey"
    FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStatusEvent"
    ADD CONSTRAINT "JobStatusEvent_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL, not CASCADE: a deleted admin account must not erase the record that
-- somebody moved this job.
ALTER TABLE "JobStatusEvent"
    ADD CONSTRAINT "JobStatusEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication"
    ADD CONSTRAINT "JobApplication_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobApplication"
    ADD CONSTRAINT "JobApplication_workerId_fkey"
    FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTrigger
-- The same function the profile tables use (migration 20260721171000). Jobs must
-- derive their geography exactly the way workers do, or a radius search finds
-- the worker and misses the job standing next to them.
CREATE TRIGGER "Job_sync_location"
    BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "Job"
    FOR EACH ROW EXECUTE FUNCTION trustpro_sync_location();
