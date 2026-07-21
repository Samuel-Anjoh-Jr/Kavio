-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPT 73 — Safety & SOS (SOS-01, SOS-02, SOS-03)
--
-- An SOS alert is an auditable safety event: triggering captures the person's
-- position and fans it out to their emergency contacts and/or the safety process.
-- Every alert stays on file with its resolution, and every share records whether
-- it reached someone — a safety feature that cannot prove it notified anyone is
-- not a safety feature.
--
-- SOSAlert.location reuses the shared trustpro_sync_location() trigger (migration
-- 20260721171000): the GIST-indexed geography is derived from the plain lat/lng,
-- so an alert's position is queryable on the same authoritative geometry as every
-- other coordinate in the system.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "SOSStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'FALSE_ALARM');

-- CreateTable
CREATE TABLE "EmergencyContact" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "relationship" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SOSAlert" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "SOSStatus" NOT NULL DEFAULT 'ACTIVE',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "message" TEXT,
    "jobId" UUID,
    "bookingId" UUID,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SOSAlert_pkey" PRIMARY KEY ("id")
);

-- Geography column added separately (Prisma writes it Unsupported); derived from
-- latitude/longitude by the shared trigger below.
ALTER TABLE "SOSAlert" ADD COLUMN "location" geography(Point, 4326);

-- CreateTable
CREATE TABLE "SOSAlertShare" (
    "id" UUID NOT NULL,
    "sosAlertId" UUID NOT NULL,
    "emergencyContactId" UUID,
    "channel" TEXT NOT NULL,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SOSAlertShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SOSAlertEvent" (
    "id" UUID NOT NULL,
    "sosAlertId" UUID NOT NULL,
    "fromStatus" "SOSStatus",
    "toStatus" "SOSStatus" NOT NULL,
    "actorId" UUID,
    "note" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SOSAlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmergencyContact_userId_isActive_idx" ON "EmergencyContact"("userId", "isActive");

-- CreateIndex
CREATE INDEX "SOSAlert_userId_createdAt_idx" ON "SOSAlert"("userId", "createdAt");
CREATE INDEX "SOSAlert_status_createdAt_idx" ON "SOSAlert"("status", "createdAt");
-- GIST — an alert's position, on the same authoritative geometry as everything else.
CREATE INDEX "SOSAlert_location_gist" ON "SOSAlert" USING GIST ("location") WHERE "location" IS NOT NULL;

-- CreateIndex
CREATE INDEX "SOSAlertShare_sosAlertId_idx" ON "SOSAlertShare"("sosAlertId");

-- CreateIndex
CREATE INDEX "SOSAlertEvent_sosAlertId_createdAt_idx" ON "SOSAlertEvent"("sosAlertId", "createdAt");

-- Sync the geography from the floats, reusing the shared trigger function.
CREATE TRIGGER "SOSAlert_sync_location"
    BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "SOSAlert"
    FOR EACH ROW EXECUTE FUNCTION trustpro_sync_location();

-- AddForeignKey
ALTER TABLE "EmergencyContact"
    ADD CONSTRAINT "EmergencyContact_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SOSAlert"
    ADD CONSTRAINT "SOSAlert_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SOSAlert"
    ADD CONSTRAINT "SOSAlert_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SOSAlert"
    ADD CONSTRAINT "SOSAlert_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SOSAlert"
    ADD CONSTRAINT "SOSAlert_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SOSAlertShare"
    ADD CONSTRAINT "SOSAlertShare_sosAlertId_fkey"
    FOREIGN KEY ("sosAlertId") REFERENCES "SOSAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SOSAlertShare"
    ADD CONSTRAINT "SOSAlertShare_emergencyContactId_fkey"
    FOREIGN KEY ("emergencyContactId") REFERENCES "EmergencyContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SOSAlertEvent"
    ADD CONSTRAINT "SOSAlertEvent_sosAlertId_fkey"
    FOREIGN KEY ("sosAlertId") REFERENCES "SOSAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
