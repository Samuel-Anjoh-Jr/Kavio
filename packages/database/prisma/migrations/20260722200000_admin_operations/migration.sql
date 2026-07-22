-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPT 87, 88 — Admin operations: agent invitations, announcements, settings
-- (ADM-02, ADM-06, ADM-07)
--
-- Three tables, and one deliberate absence.
--
-- The absence first: there is NO risk-score or fraud-flag table here, even
-- though PROMPT 86 builds a Fraud & Risk monitor on top of this migration. Risk
-- is DERIVED at read time from facts that already exist — a suspended trust
-- score, disputes lost, open abuse reports, account status — because a stored
-- risk verdict is a number that nobody recomputes and everybody trusts. The
-- monitor's job is to surface signals an admin then judges, not to persist a
-- machine's opinion of a person and let it harden into a record. Blocking an
-- account likewise reuses the existing append-only ModerationAction trail rather
-- than adding a status column that would lose the reason and the actor.
--
-- AgentInvitation exists because agents CANNOT self-register. A field agent
-- physically verifies workers, which is the most abusable capability the
-- platform grants, so the only route in is an admin creating one of these rows.
-- The token is stored as a SHA-256 hash exactly like RefreshToken and the team
-- invitations before it: a leaked invitations table must not hand out agent
-- accounts. `acceptedUserId` is nullable because the identity does not exist
-- until the token is redeemed.
--
-- Announcement carries BOTH languages as NOT NULL columns rather than a
-- translations side-table with a nullable second row. The platform is bilingual
-- by requirement, and an announcement that exists only in English is one half
-- the users cannot read — which is exactly what a nullable French column
-- quietly permits. Audience is targeted by ROLE, not by a materialised recipient
-- list: the membership of "all workers" changes daily, and a saved list would be
-- stale before it was sent.
--
-- SystemSetting is key/value with a JSON payload rather than a wide typed table.
-- The settings surface grows every release, and a schema migration per toggle is
-- precisely why settings screens ossify and end up bypassed by env vars. Note
-- that SECRETS DO NOT LIVE HERE: provider keys stay in the managed secret store,
-- and this table holds only the switches and thresholds an admin is meant to
-- read. `updatedById` is what makes a surprising production value traceable to a
-- person; every write is additionally mirrored into AuditLog.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "AgentInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL', 'WORKERS', 'CLIENTS', 'BUSINESSES', 'AGENTS');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "AgentInvitation" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "tokenHash" TEXT NOT NULL,
    "status" "AgentInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById" UUID NOT NULL,
    "acceptedUserId" UUID,
    "note" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" UUID NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleFr" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "bodyFr" TEXT NOT NULL,
    "audience" "AnnouncementAudience" NOT NULL DEFAULT 'ALL',
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "expiresAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "authorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentInvitation_tokenHash_key" ON "AgentInvitation"("tokenHash");

-- The console's default view: outstanding invitations first.
-- CreateIndex
CREATE INDEX "AgentInvitation_status_createdAt_idx" ON "AgentInvitation"("status", "createdAt");

-- "Has this address already been invited?" — asked on every invite.
-- CreateIndex
CREATE INDEX "AgentInvitation_email_idx" ON "AgentInvitation"("email");

-- The reader's query: what is live for my audience, newest first.
-- CreateIndex
CREATE INDEX "Announcement_status_audience_publishedAt_idx" ON "Announcement"("status", "audience", "publishedAt");

-- CreateIndex
CREATE INDEX "SystemSetting_category_idx" ON "SystemSetting"("category");

-- AddForeignKey
ALTER TABLE "AgentInvitation" ADD CONSTRAINT "AgentInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL, not CASCADE: deleting an agent identity must not erase the record
-- that an admin invited them.
-- AddForeignKey
ALTER TABLE "AgentInvitation" ADD CONSTRAINT "AgentInvitation_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL: a setting outlives the admin who last touched it, and losing the
-- setting because an account was removed would be the worse failure.
-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
