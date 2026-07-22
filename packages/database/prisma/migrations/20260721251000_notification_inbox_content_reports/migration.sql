-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPT 78 + universal reporting & moderation (part 2 of 2).
--
-- Three things land here:
--
--   Notification      the in-app inbox the Notification Center reads (NOT-02).
--                     NOT the same thing as NotificationLog: a log row is one
--                     delivery ATTEMPT on one channel and stores no rendered
--                     content, while this is the message a person actually reads
--                     and marks read. The IN_APP provider writes it through the
--                     same dispatcher as email/push, so the inbox cannot be
--                     reached without honouring preferences.
--
--   AbuseReport       widened from "a conversation, a message, or a user" to
--   (targetType,      ANYTHING a user can see. The (type, id) pair is the
--    targetId)        grouping key of the moderation workspace: twelve reports
--                     about one photo are ONE case, not twelve. Deliberately not
--                     a foreign key — the queue must survive the reported item
--                     being deleted, which is often the outcome.
--
--   ModerationAction  what an admin decided, as its own append-only row. One
--                     decision usually settles many reports about the same item,
--                     which a column on the report could not express; and a
--                     suspension recorded as a row (who, why, over what, until
--                     when) is the difference between due process and a silent
--                     User.status write.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM (
    'USER',
    'WORKER_PROFILE',
    'BUSINESS_PROFILE',
    'JOB',
    'PORTFOLIO_ITEM',
    'MEDIA_ASSET',
    'REVIEW',
    'QUOTE',
    'MESSAGE',
    'CONVERSATION'
);

-- CreateEnum
CREATE TYPE "ModerationActionType" AS ENUM (
    'WARN',
    'CONTENT_REMOVED',
    'SUSPEND',
    'BAN',
    'REINSTATE',
    'DISMISS'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- The in-app inbox (NOT-02)
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "templateKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "important" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX "Notification_userId_important_createdAt_idx" ON "Notification"("userId", "important", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Moderation decisions (ADM-08)
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" UUID NOT NULL,
    "subjectUserId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" "ModerationActionType" NOT NULL,
    "targetType" "ReportTargetType",
    "targetId" UUID,
    "reason" TEXT NOT NULL,
    "internalNote" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModerationAction_subjectUserId_createdAt_idx" ON "ModerationAction"("subjectUserId", "createdAt");
CREATE INDEX "ModerationAction_targetType_targetId_idx" ON "ModerationAction"("targetType", "targetId");
-- The sweep that lapses time-boxed suspensions.
CREATE INDEX "ModerationAction_action_expiresAt_idx" ON "ModerationAction"("action", "expiresAt");

-- AddForeignKey
ALTER TABLE "ModerationAction"
    ADD CONSTRAINT "ModerationAction_subjectUserId_fkey"
    FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An admin who acted cannot be deleted out from under the audit trail.
ALTER TABLE "ModerationAction"
    ADD CONSTRAINT "ModerationAction_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- AbuseReport → universal content report
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterTable
-- Added nullable so existing rows survive the ALTER, backfilled below, then made
-- NOT NULL. A DEFAULT would have been the easy path and the wrong one: it would
-- silently label every future insert that forgot a target as a USER report.
ALTER TABLE "AbuseReport" ADD COLUMN "targetType" "ReportTargetType";
ALTER TABLE "AbuseReport" ADD COLUMN "targetId" UUID;
ALTER TABLE "AbuseReport" ADD COLUMN "moderationActionId" UUID;

-- Backfill: existing reports are messaging reports. Most specific target wins —
-- a report citing a message is about that message, not the whole thread.
UPDATE "AbuseReport"
SET "targetType" = CASE
        WHEN "messageId" IS NOT NULL THEN 'MESSAGE'::"ReportTargetType"
        WHEN "conversationId" IS NOT NULL THEN 'CONVERSATION'::"ReportTargetType"
        ELSE 'USER'::"ReportTargetType"
    END,
    "targetId" = COALESCE("messageId", "conversationId", "reportedUserId")
WHERE "targetType" IS NULL;

-- AlterTable
ALTER TABLE "AbuseReport" ALTER COLUMN "targetType" SET NOT NULL;
ALTER TABLE "AbuseReport" ALTER COLUMN "targetId" SET NOT NULL;

-- CreateIndex
-- The grouped workspace: every report about one item.
CREATE INDEX "AbuseReport_targetType_targetId_status_idx" ON "AbuseReport"("targetType", "targetId", "status");
CREATE INDEX "AbuseReport_moderationActionId_idx" ON "AbuseReport"("moderationActionId");

-- AddForeignKey
-- SET NULL, not CASCADE: deleting a decision must never delete the complaints
-- that prompted it.
ALTER TABLE "AbuseReport"
    ADD CONSTRAINT "AbuseReport_moderationActionId_fkey"
    FOREIGN KEY ("moderationActionId") REFERENCES "ModerationAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
