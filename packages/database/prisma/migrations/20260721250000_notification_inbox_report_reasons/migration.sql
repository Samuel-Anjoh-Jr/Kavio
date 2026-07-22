-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPT 78 + universal reporting — enum values only (part 1 of 2).
--
-- Postgres refuses to USE an enum value in the same transaction that adds it, and
-- Prisma applies each migration file in one transaction. So every ALTER TYPE …
-- ADD VALUE lands here, and the tables/backfills that write these values live in
-- the next migration. Appended, never reordered: ADD VALUE can only append, so
-- schema.prisma keeps this order or the next deploy reports drift.
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterEnum
-- The in-app inbox is a CHANNEL, not a side-effect: a provider that writes a
-- Notification row rather than calling a network. That is what puts it in the
-- NOT-02 preference grid alongside push and email.
ALTER TYPE "NotificationChannel" ADD VALUE 'IN_APP';

-- AlterEnum
-- Reporting widened from messaging to anything a user can see, and a fake profile
-- or a stolen portfolio photo is a different offence from chat spam. Collapsing
-- them into OTHER is what makes a moderation queue unsortable.
ALTER TYPE "AbuseReportReason" ADD VALUE 'FAKE_PROFILE';
ALTER TYPE "AbuseReportReason" ADD VALUE 'STOLEN_CONTENT';
ALTER TYPE "AbuseReportReason" ADD VALUE 'MISLEADING';
ALTER TYPE "AbuseReportReason" ADD VALUE 'ILLEGAL';
