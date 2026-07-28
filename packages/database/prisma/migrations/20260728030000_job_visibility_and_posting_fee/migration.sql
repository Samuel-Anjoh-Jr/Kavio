-- Job visibility split + the posting fee.
--
-- Hiring and advertising were one action, and gating that action on business
-- verification would have stopped a client hiring anyone: a Quote requires a
-- Job, and a Job must be OPEN before it can be quoted or invited on. So the
-- gate belongs on VISIBILITY, not on publishing.
--
--   DIRECT  a private engagement between a client and a worker they chose.
--           Never on the job board, so it carries no lure risk. No
--           verification, no fee — this is the flow a client with no KYC uses.
--   PUBLIC  a broadcast vacancy on the board. This is the surface a fake-job
--           lure abuses, so it needs a verified business behind it and it is
--           what the posting fee is charged for.
CREATE TYPE "JobVisibility" AS ENUM ('DIRECT', 'PUBLIC');

ALTER TABLE "Job"
    ADD COLUMN "visibility" "JobVisibility" NOT NULL DEFAULT 'DIRECT',
    -- Frozen at publish time. Reading the live setting when rendering an old
    -- job would retroactively restate what its poster was charged.
    ADD COLUMN "postingFeeXaf" INTEGER NOT NULL DEFAULT 0;

-- Everything that already reached the board WAS a public listing; leaving them
-- DIRECT would empty the job board on deploy.
UPDATE "Job"
   SET "visibility" = 'PUBLIC'
 WHERE "status" <> 'DRAFT';

-- The job board reads exactly this: public listings, newest first.
CREATE INDEX "Job_visibility_status_publishedAt_idx"
    ON "Job" ("visibility", "status", "publishedAt" DESC);
