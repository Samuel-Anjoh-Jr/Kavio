-- Portfolio showcase (SRS §26.2).
--
-- The landing page's before/after trade showcase becomes database-driven with
-- admin CRUD, replacing the hardcoded PORTFOLIO_TRADES/PORTFOLIO_PHOTOS arrays
-- the page previously carried. Mirrors the Faq/Testimonial precedent: bilingual
-- EN/FR columns as NOT NULL (SYS-03), admin-chosen `order`, and an
-- `isPublished` draft/live toggle matching Faq's naming.

-- CreateTable
CREATE TABLE "PortfolioShowcase" (
    "id" UUID NOT NULL,
    "tradeEn" TEXT NOT NULL,
    "tradeFr" TEXT NOT NULL,
    "captionEn" TEXT NOT NULL,
    "captionFr" TEXT NOT NULL,
    "beforeUrl" TEXT NOT NULL,
    "afterUrl" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioShowcase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The public read is "published, in order"; the admin list sorts the same way.
CREATE INDEX "PortfolioShowcase_isPublished_order_idx" ON "PortfolioShowcase"("isPublished", "order");
