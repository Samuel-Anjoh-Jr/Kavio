-- AlterEnum
ALTER TYPE "DevicePlatform" ADD VALUE 'ANDROID';
ALTER TYPE "DevicePlatform" ADD VALUE 'IOS';

-- AlterTable
ALTER TABLE "DeviceRegistration" ADD COLUMN "alertsVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AlertDelivery" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "templateKey" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ackedAt" TIMESTAMP(3),
    "ackSource" TEXT,
    "step" INTEGER NOT NULL DEFAULT 0,
    "outcomes" JSONB,

    CONSTRAINT "AlertDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlertDelivery_entityType_entityId_ackedAt_idx" ON "AlertDelivery"("entityType", "entityId", "ackedAt");

-- CreateIndex
CREATE INDEX "AlertDelivery_userId_ackedAt_idx" ON "AlertDelivery"("userId", "ackedAt");

-- CreateIndex
CREATE INDEX "AlertDelivery_sentAt_idx" ON "AlertDelivery"("sentAt");
