-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPT 37 — Service catalog (SRS §6, PRO-05, ADM-02, DIS-05)
--
-- Three additions, all of them about making a worker's offer findable:
--   ServiceCategory        the admin-managed taxonomy search is scoped to
--   Service.categoryId     the (nullable) link from a listing into that taxonomy
--   AvailabilityException  one-off overrides of the weekly availability rule
--
-- Service, Availability and PortfolioItem themselves already exist (PROMPT 21):
-- onboarding created them. PortfolioItem needs no change here — its bytes live
-- on MediaAsset (`s3Key`, PROMPT 27), and duplicating that key onto the
-- portfolio row would give the same file two sources of truth.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "descriptionEn" TEXT,
    "descriptionFr" TEXT,
    "icon" TEXT,
    "parentId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "workerCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCategory_slug_key" ON "ServiceCategory"("slug");

-- CreateIndex
CREATE INDEX "ServiceCategory_isActive_sortOrder_idx" ON "ServiceCategory"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "ServiceCategory_parentId_sortOrder_idx" ON "ServiceCategory"("parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "ServiceCategory_workerCount_idx" ON "ServiceCategory"("workerCount");

-- AddForeignKey
-- SET NULL, not CASCADE: retiring a parent trade must never silently delete the
-- specialisations underneath it along with every listing that referenced them.
ALTER TABLE "ServiceCategory" ADD CONSTRAINT "ServiceCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Service joins the taxonomy. Nullable, so intake is never blocked on an admin
-- having created the right category first (see the model comment).
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "Service" ADD COLUMN "categoryId" UUID;

-- CreateIndex
CREATE INDEX "Service_categoryId_isActive_idx" ON "Service"("categoryId", "isActive");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Availability exceptions (PRO-05). DATE rather than TIMESTAMP: a public holiday
-- is a calendar day, not an instant, and storing it as one would bind it to
-- whichever timezone happened to write the row.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "AvailabilityException" (
    "id" UUID NOT NULL,
    "workerProfileId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT false,
    "startTime" TEXT,
    "endTime" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityException_workerProfileId_date_key" ON "AvailabilityException"("workerProfileId", "date");

-- CreateIndex
CREATE INDEX "AvailabilityException_workerProfileId_date_idx" ON "AvailabilityException"("workerProfileId", "date");

-- AddForeignKey
ALTER TABLE "AvailabilityException" ADD CONSTRAINT "AvailabilityException_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
