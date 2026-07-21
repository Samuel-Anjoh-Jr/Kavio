-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPT 55 — Job category optional while drafting (JOB-02 autosave)
--
-- The jobs schema (migration 20260721190000) made Job.categoryId NOT NULL, which
-- is right for a LIVE job but wrong for a draft: the post-job stepper autosaves
-- (JOB-02) before the category step is necessarily done, and a draft that cannot
-- be saved without a category is not an autosave.
--
-- So the column is relaxed to nullable here, and completeness — category
-- included — is enforced at PUBLISH by JobsService instead. No OPEN job is ever
-- uncategorised; a DRAFT may be. The foreign key and its RESTRICT rule are
-- unchanged: a null simply means "not chosen yet", and any category that IS
-- referenced still cannot be deleted out from under a job.
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "Job" ALTER COLUMN "categoryId" DROP NOT NULL;
