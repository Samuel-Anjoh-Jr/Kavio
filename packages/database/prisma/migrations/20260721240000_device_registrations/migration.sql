-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPT 76 — Web-push device registry (NOT-01, SRS §26.1)
--
-- Web push targets a SUBSCRIPTION (endpoint + VAPID keys), not a user, so one
-- identity has many registrations. `endpoint` is globally unique — it IS the
-- delivery address — so a re-subscribe on the same browser upserts this row
-- rather than piling up dead duplicates. A push that fails because the browser
-- dropped the subscription deactivates the row (isActive=false) so the dispatcher
-- stops aiming at a dead endpoint.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('WEB');

-- CreateTable
CREATE TABLE "DeviceRegistration" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "platform" "DevicePlatform" NOT NULL DEFAULT 'WEB',
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "deviceName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceRegistration_endpoint_key" ON "DeviceRegistration"("endpoint");
CREATE INDEX "DeviceRegistration_userId_isActive_idx" ON "DeviceRegistration"("userId", "isActive");

-- AddForeignKey
ALTER TABLE "DeviceRegistration"
    ADD CONSTRAINT "DeviceRegistration_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
