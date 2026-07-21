-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPT 57 — Inviting specific workers to a job (JOB-03)
--
-- Its own table rather than a flag on JobApplication, because the direction of
-- consent is opposite: an application is a worker offering themselves, an
-- invitation is a client asking. Folding them together would make "who
-- approached whom" unrecoverable — and that is precisely what a worker weighs
-- when deciding whether a job is worth quoting for.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "JobInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "JobInvitation" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "invitedById" UUID NOT NULL,
    "status" "JobInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "expiresAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One invitation per worker per job. Re-inviting is nagging, and a worker's
-- Job Requests inbox is the surface it would be nagging on.
CREATE UNIQUE INDEX "JobInvitation_jobId_workerId_key" ON "JobInvitation"("jobId", "workerId");
CREATE INDEX "JobInvitation_workerId_status_createdAt_idx" ON "JobInvitation"("workerId", "status", "createdAt");
CREATE INDEX "JobInvitation_jobId_status_idx" ON "JobInvitation"("jobId", "status");
-- The lazy expiry sweep: pending invitations whose expiry has passed.
CREATE INDEX "JobInvitation_status_expiresAt_idx" ON "JobInvitation"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "JobInvitation"
    ADD CONSTRAINT "JobInvitation_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobInvitation"
    ADD CONSTRAINT "JobInvitation_workerId_fkey"
    FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobInvitation"
    ADD CONSTRAINT "JobInvitation_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
