import { z } from 'zod';

/**
 * Marketing-content writes (SRS §26.2). REST, per the DUAL API RULE.
 *
 * Both languages are REQUIRED on creation, matching the taxonomy DTOs and for
 * the same reason: this is admin-authored content stored bilingually on the row,
 * so an entry created in English only is permanently broken for every French
 * visitor — on the conversion surface, where nobody downstream would flag it.
 */

const shortText = (max: number) => z.string().trim().min(2).max(max);

const question = shortText(200);
const answer = z
  .string()
  .trim()
  .min(2, 'Write an answer.')
  .max(4_000, 'Keep the answer under 4000 characters.');

export const createFaqSchema = z.object({
  questionEn: question,
  questionFr: question,
  answerEn: answer,
  answerFr: answer,
  category: z.string().trim().max(60).optional(),
  order: z.number().int().min(0).max(9_999).optional(),
  isPublished: z.boolean().optional(),
});

export type CreateFaqDto = z.infer<typeof createFaqSchema>;

export const updateFaqSchema = z
  .object({
    questionEn: question,
    questionFr: question,
    answerEn: answer,
    answerFr: answer,
    category: z.string().trim().max(60).nullable(),
    order: z.number().int().min(0).max(9_999),
    isPublished: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Change at least one field.' });

export type UpdateFaqDto = z.infer<typeof updateFaqSchema>;

/**
 * The rating range is enforced HERE rather than by a database CHECK constraint,
 * so an out-of-range value comes back as a field-level validation error the
 * admin form can render inline (SYS-06) instead of a 500 from the driver.
 *
 * `multipleOf(0.1)` matches the DECIMAL(2,1) column exactly: a 4.25 accepted by
 * the API and silently rounded by Postgres would leave the admin looking at a
 * number they did not type.
 */
const rating = z
  .number()
  .min(0, 'Ratings start at 0.')
  .max(5, 'Ratings stop at 5.')
  .multipleOf(0.1, 'Use at most one decimal place.');

const testimonialContent = z
  .string()
  .trim()
  .min(2, 'Write the testimonial.')
  .max(600, 'Keep it under 600 characters — the marquee card line-clamps beyond that.');

export const createTestimonialSchema = z.object({
  author: shortText(80),
  roleEn: shortText(80),
  roleFr: shortText(80),
  /** A stored media URL or null. Validated as a URL so a typo cannot render a broken avatar. */
  avatarUrl: z.url('Use a valid image URL.').max(500).optional(),
  contentEn: testimonialContent,
  contentFr: testimonialContent,
  rating,
  order: z.number().int().min(0).max(9_999).optional(),
  visible: z.boolean().optional(),
});

export type CreateTestimonialDto = z.infer<typeof createTestimonialSchema>;

export const updateTestimonialSchema = z
  .object({
    author: shortText(80),
    roleEn: shortText(80),
    roleFr: shortText(80),
    avatarUrl: z.url().max(500).nullable(),
    contentEn: testimonialContent,
    contentFr: testimonialContent,
    rating,
    order: z.number().int().min(0).max(9_999),
    visible: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Change at least one field.' });

export type UpdateTestimonialDto = z.infer<typeof updateTestimonialSchema>;

const trade = shortText(80);
const caption = shortText(200);

export const createPortfolioItemSchema = z.object({
  tradeEn: trade,
  tradeFr: trade,
  captionEn: caption,
  captionFr: caption,
  beforeUrl: z.url('Use a valid image URL.').max(500),
  afterUrl: z.url('Use a valid image URL.').max(500),
  order: z.number().int().min(0).max(9_999).optional(),
  isPublished: z.boolean().optional(),
});

export type CreatePortfolioItemDto = z.infer<typeof createPortfolioItemSchema>;

export const updatePortfolioItemSchema = z
  .object({
    tradeEn: trade,
    tradeFr: trade,
    captionEn: caption,
    captionFr: caption,
    beforeUrl: z.url().max(500),
    afterUrl: z.url().max(500),
    order: z.number().int().min(0).max(9_999),
    isPublished: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Change at least one field.' });

export type UpdatePortfolioItemDto = z.infer<typeof updatePortfolioItemSchema>;

/**
 * Bulk reorder, so an admin drags the list into shape and saves once.
 *
 * One request rather than N PATCHes because the intermediate states of a
 * drag-reorder are not states anyone should be able to observe: a visitor
 * loading the page mid-save would otherwise see the list half-reordered.
 */
export const reorderSchema = z.object({
  order: z
    .array(z.object({ id: z.uuid(), order: z.number().int().min(0).max(9_999) }))
    .min(1, 'Send at least one entry.')
    .max(500),
});

export type ReorderDto = z.infer<typeof reorderSchema>;
