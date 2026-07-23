-- Marketing content (PROMPT 92.1; SRS §26.2).
--
-- FAQ and testimonials become database-driven with admin CRUD, replacing the
-- hardcoded arrays a landing page normally accumulates. Both tables carry EN and
-- FR as NOT NULL columns, matching the Announcement precedent: the platform is
-- bilingual by requirement (SYS-03).

-- CreateTable
CREATE TABLE "Faq" (
    "id" UUID NOT NULL,
    "questionEn" TEXT NOT NULL,
    "questionFr" TEXT NOT NULL,
    "answerEn" TEXT NOT NULL,
    "answerFr" TEXT NOT NULL,
    "category" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Testimonial" (
    "id" UUID NOT NULL,
    "author" TEXT NOT NULL,
    "roleEn" TEXT NOT NULL,
    "roleFr" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "contentEn" TEXT NOT NULL,
    "contentFr" TEXT NOT NULL,
    -- DECIMAL(2,1) holds 0.0–9.9; the 0–5 range is enforced in the DTO rather
    -- than by a CHECK, so a rejected value comes back as a field-level
    -- validation error the admin form can show inline (SYS-06).
    "rating" DECIMAL(2,1) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The public read is "published, in order"; the admin list sorts the same way.
CREATE INDEX "Faq_isPublished_order_idx" ON "Faq"("isPublished", "order");

-- CreateIndex
CREATE INDEX "Faq_category_order_idx" ON "Faq"("category", "order");

-- CreateIndex
CREATE INDEX "Testimonial_visible_order_idx" ON "Testimonial"("visible", "order");
