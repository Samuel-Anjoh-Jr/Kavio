-- Optional attachments on a job application (JOB-04).
--
-- Kavio serves plenty of roles with no portfolio to browse — a night watchman,
-- a cashier, a server — where the poster's only evidence before shortlisting is
-- the applicant's message. This lets that worker attach a CV, a reference
-- letter or an ID scan, same as a quote can carry a sketch or a parts list.
-- Postgres can only APPEND to an enum, which is why MediaAssetKind's order is
-- treated as immutable in schema.prisma.
ALTER TYPE "MediaAssetKind" ADD VALUE 'JOB_APPLICATION_ATTACHMENT';

-- CreateTable
CREATE TABLE "JobApplicationAttachment" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobApplicationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobApplicationAttachment_applicationId_mediaAssetId_key" ON "JobApplicationAttachment"("applicationId", "mediaAssetId");
CREATE INDEX "JobApplicationAttachment_applicationId_idx" ON "JobApplicationAttachment"("applicationId");

-- AddForeignKey
ALTER TABLE "JobApplicationAttachment"
    ADD CONSTRAINT "JobApplicationAttachment_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobApplicationAttachment"
    ADD CONSTRAINT "JobApplicationAttachment_mediaAssetId_fkey"
    FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
