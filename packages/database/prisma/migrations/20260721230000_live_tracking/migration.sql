-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPT 74 — Live tracking (SOS-03; CLAUDE.md SPATIAL foreground streaming)
--
-- A tracking session streams a worker's live position to a consented client while
-- the tracking screen is open. Foreground only — the web has no reliable
-- background tracking — with explicit, revocable consent (consentGrantedAt /
-- consentRevokedAt). Pings persist to PostGIS so a route is replayable for a
-- safety review; LocationPing.location reuses the shared trustpro_sync_location()
-- trigger, so a ping lives on the same authoritative geometry as everything else.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "TrackingSessionStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateTable
CREATE TABLE "TrackingSession" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "viewerId" UUID NOT NULL,
    "status" "TrackingSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "destinationLat" DOUBLE PRECISION,
    "destinationLng" DOUBLE PRECISION,
    "consentGrantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consentRevokedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationPing" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationPing_pkey" PRIMARY KEY ("id")
);

-- Geography column added separately (Prisma writes it Unsupported); derived from
-- latitude/longitude by the shared trigger below.
ALTER TABLE "LocationPing" ADD COLUMN "location" geography(Point, 4326);

-- CreateIndex
CREATE INDEX "TrackingSession_bookingId_status_idx" ON "TrackingSession"("bookingId", "status");
CREATE INDEX "TrackingSession_subjectId_status_idx" ON "TrackingSession"("subjectId", "status");
CREATE INDEX "TrackingSession_viewerId_status_idx" ON "TrackingSession"("viewerId", "status");
-- At most one LIVE session per booking + viewer: re-opening the screen resumes
-- rather than forking a second channel.
CREATE UNIQUE INDEX "TrackingSession_booking_viewer_active_key" ON "TrackingSession"("bookingId", "viewerId") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "LocationPing_sessionId_recordedAt_idx" ON "LocationPing"("sessionId", "recordedAt");
CREATE INDEX "LocationPing_userId_recordedAt_idx" ON "LocationPing"("userId", "recordedAt");
-- GIST — replayable routes and any spatial safety query over the trail.
CREATE INDEX "LocationPing_location_gist" ON "LocationPing" USING GIST ("location") WHERE "location" IS NOT NULL;

-- Sync the geography from the floats, reusing the shared trigger function.
CREATE TRIGGER "LocationPing_sync_location"
    BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "LocationPing"
    FOR EACH ROW EXECUTE FUNCTION trustpro_sync_location();

-- AddForeignKey
ALTER TABLE "TrackingSession"
    ADD CONSTRAINT "TrackingSession_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrackingSession"
    ADD CONSTRAINT "TrackingSession_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrackingSession"
    ADD CONSTRAINT "TrackingSession_viewerId_fkey"
    FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing"
    ADD CONSTRAINT "LocationPing_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "TrackingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LocationPing"
    ADD CONSTRAINT "LocationPing_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
