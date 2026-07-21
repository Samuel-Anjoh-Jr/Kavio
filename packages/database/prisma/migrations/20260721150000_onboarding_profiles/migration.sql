-- Onboarding and profiles (ACC-10, TRU-05, BIZ-04 intake). PROMPTS 20, 21, 22.
--
-- Adds resumable onboarding state plus the typed profile models it materialises
-- into on completion, and the S3-backed media records the flows upload to.

-- CreateEnum
CREATE TYPE "OnboardingRole" AS ENUM ('WORKER', 'CLIENT', 'BUSINESS');

-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('DEVICE_GPS', 'HUMAN_INPUT', 'REVERSE_GEOCODE');

-- CreateEnum
CREATE TYPE "TeamMemberRole" AS ENUM ('ADMIN', 'HR_MANAGER', 'ACCOUNTANT', 'STAFF');

-- CreateEnum
CREATE TYPE "TeamMemberAccessLevel" AS ENUM ('FULL', 'MANAGE_JOBS', 'PAYMENTS', 'VIEW_ONLY');

-- CreateEnum
CREATE TYPE "TeamMemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "PortfolioItemType" AS ENUM ('PHOTO', 'VIDEO', 'PROJECT');

-- CreateEnum
CREATE TYPE "MediaAssetKind" AS ENUM ('PORTFOLIO_IMAGE', 'NATIONAL_ID_FRONT', 'NATIONAL_ID_BACK', 'SELFIE', 'BUSINESS_REGISTRATION', 'BUSINESS_LOGO');

-- CreateEnum
CREATE TYPE "MediaVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateTable
CREATE TABLE "OnboardingProgress" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "OnboardingRole" NOT NULL,
    "currentStep" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "completionPercent" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "yearsExperience" INTEGER,
    "city" TEXT,
    "area" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationSource" "LocationSource",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" TEXT,
    "city" TEXT,
    "area" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationSource" "LocationSource",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessProfile" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rccmNumber" TEXT,
    "taxId" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "city" TEXT,
    "area" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationSource" "LocationSource",
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessTeamMember" (
    "id" UUID NOT NULL,
    "businessProfileId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" "TeamMemberRole" NOT NULL DEFAULT 'STAFF',
    "accessLevel" "TeamMemberAccessLevel" NOT NULL DEFAULT 'VIEW_ONLY',
    "status" "TeamMemberStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" UUID NOT NULL,
    "workerProfileId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startingPrice" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Availability" (
    "id" UUID NOT NULL,
    "workerProfileId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioItem" (
    "id" UUID NOT NULL,
    "workerProfileId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "type" "PortfolioItemType" NOT NULL DEFAULT 'PHOTO',
    "caption" TEXT,
    "groupKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "kind" "MediaAssetKind" NOT NULL,
    "s3Key" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "visibility" "MediaVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnboardingProgress_userId_idx" ON "OnboardingProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_userId_role_key" ON "OnboardingProgress"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerProfile_userId_key" ON "WorkerProfile"("userId");

-- CreateIndex
CREATE INDEX "WorkerProfile_city_idx" ON "WorkerProfile"("city");

-- CreateIndex
CREATE UNIQUE INDEX "ClientProfile_userId_key" ON "ClientProfile"("userId");

-- CreateIndex
CREATE INDEX "ClientProfile_city_idx" ON "ClientProfile"("city");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessProfile_ownerId_key" ON "BusinessProfile"("ownerId");

-- CreateIndex
CREATE INDEX "BusinessProfile_city_idx" ON "BusinessProfile"("city");

-- CreateIndex
CREATE INDEX "BusinessTeamMember_businessProfileId_status_idx" ON "BusinessTeamMember"("businessProfileId", "status");

-- CreateIndex
CREATE INDEX "Service_workerProfileId_isActive_idx" ON "Service"("workerProfileId", "isActive");

-- CreateIndex
CREATE INDEX "Availability_workerProfileId_dayOfWeek_idx" ON "Availability"("workerProfileId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "Availability_workerProfileId_dayOfWeek_startTime_endTime_key" ON "Availability"("workerProfileId", "dayOfWeek", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "PortfolioItem_workerProfileId_groupKey_idx" ON "PortfolioItem"("workerProfileId", "groupKey");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_s3Key_key" ON "MediaAsset"("s3Key");

-- CreateIndex
CREATE INDEX "MediaAsset_ownerId_kind_createdAt_idx" ON "MediaAsset"("ownerId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientProfile" ADD CONSTRAINT "ClientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessTeamMember" ADD CONSTRAINT "BusinessTeamMember_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "BusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
