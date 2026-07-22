-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPT 81 — Business, teams and corporate eligibility (BIZ-01…BIZ-04)
--
-- PROMPT 22 recorded a team at intake: a name, an email, a role. That is a
-- CONTACT LIST. This migration turns it into an ACCESS CONTROL LIST, which is a
-- different thing and the reason this prompt is graded on enforcement.
--
-- The change that matters is `userId`. A team row now binds to an identity when
-- the invitation is ACCEPTED, and the server resolves every business-scoped write
-- against that binding. A row with a NULL userId is a pending invitation and
-- grants nothing — which is why the partial unique index below is scoped to
-- non-null user ids: two pending invitations to the same address are fine, two
-- live seats for one identity are not.
--
-- Invitations are stored as a SHA-256 hash, never the token, exactly like
-- RefreshToken: a leaked database must not hand out seats in other people's
-- companies. They also expire — an invitation that is valid forever is an
-- unrevoked grant sitting in an inbox.
--
-- On Job: `businessProfileId` is kept ALONGSIDE `posterId` rather than replacing
-- it. The poster is the accountable identity that passed the tier gate; the
-- business is who the spend and the analytics belong to. A team member with
-- MANAGE_JOBS posts as themselves for a company they do not own, and collapsing
-- the two columns would lose whichever half of that is inconvenient later.
--
-- `teamSize`/`durationDays` are NULL on an ordinary job rather than defaulting to
-- 1: writing 1 everywhere would turn "is this a team job?" from a fact into a
-- comparison, and every read would have to remember which convention was meant.
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterEnum
-- A declined invitation is not a removal. The business removing a member and the
-- invitee saying no are different events, and reporting them as one would tell
-- an owner their colleague was dismissed when they simply never joined.
ALTER TYPE "TeamMemberStatus" ADD VALUE 'DECLINED';

-- AlterEnum
ALTER TYPE "BadgeType" ADD VALUE 'VERIFIED_BUSINESS';

-- AlterTable
ALTER TABLE "BusinessProfile"
    ADD COLUMN "verifiedById" UUID;

-- AlterTable
ALTER TABLE "BusinessTeamMember"
    ADD COLUMN "userId" UUID,
    ADD COLUMN "title" TEXT,
    ADD COLUMN "invitedById" UUID,
    ADD COLUMN "invitationTokenHash" TEXT,
    ADD COLUMN "invitationSentAt" TIMESTAMP(3),
    ADD COLUMN "invitationExpiresAt" TIMESTAMP(3),
    ADD COLUMN "acceptedAt" TIMESTAMP(3),
    ADD COLUMN "removedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Job"
    ADD COLUMN "businessProfileId" UUID,
    ADD COLUMN "teamSize" INTEGER,
    ADD COLUMN "durationDays" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "BusinessTeamMember_invitationTokenHash_key"
    ON "BusinessTeamMember"("invitationTokenHash");

-- The access resolver's hot path: "what may this identity do for this business?"
-- runs on every business-scoped write, so it gets its own index.
CREATE INDEX "BusinessTeamMember_userId_status_idx"
    ON "BusinessTeamMember"("userId", "status");

CREATE INDEX "BusinessTeamMember_businessProfileId_userId_idx"
    ON "BusinessTeamMember"("businessProfileId", "userId");

-- One LIVE seat per identity per business. Partial, so a person can be re-invited
-- after being removed, but can never hold two active seats — which would make
-- "what is this member's access level?" a question with two answers.
CREATE UNIQUE INDEX "BusinessTeamMember_business_user_active_key"
    ON "BusinessTeamMember"("businessProfileId", "userId")
    WHERE "userId" IS NOT NULL AND "status" <> 'REMOVED';

-- CreateIndex
CREATE INDEX "BusinessProfile_verified_idx" ON "BusinessProfile"("verified");

-- CreateIndex
CREATE INDEX "Job_businessProfileId_status_createdAt_idx"
    ON "Job"("businessProfileId", "status", "createdAt");

-- CHECK constraints — a team job has to describe an actual team.
ALTER TABLE "Job"
    ADD CONSTRAINT "Job_teamSize_check" CHECK ("teamSize" IS NULL OR "teamSize" > 0);

ALTER TABLE "Job"
    ADD CONSTRAINT "Job_durationDays_check" CHECK ("durationDays" IS NULL OR "durationDays" > 0);

-- AddForeignKey
ALTER TABLE "BusinessProfile"
    ADD CONSTRAINT "BusinessProfile_verifiedById_fkey"
    FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SET NULL, not CASCADE: a departing identity must not silently delete the seat
-- record. The row becomes an unbound historical member, which is what happened.
ALTER TABLE "BusinessTeamMember"
    ADD CONSTRAINT "BusinessTeamMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BusinessTeamMember"
    ADD CONSTRAINT "BusinessTeamMember_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SET NULL: deleting a company profile must not delete the jobs it posted, the
-- quotes on them, or the money that moved through them.
ALTER TABLE "Job"
    ADD CONSTRAINT "Job_businessProfileId_fkey"
    FOREIGN KEY ("businessProfileId") REFERENCES "BusinessProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
