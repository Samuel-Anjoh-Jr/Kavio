import { z } from 'zod';

/**
 * Admin taxonomy writes (ADM-02). REST, per the DUAL API RULE.
 *
 * Names are required in BOTH languages on creation. That is not bureaucracy: the
 * taxonomy is admin-authored content stored bilingually on the row (unlike
 * developer-authored copy, which lives in next-intl), so a category created with
 * only an English name is permanently broken for every French user — and nothing
 * downstream would ever flag it.
 */

const name = z
  .string()
  .trim()
  .min(2, 'Use at least 2 characters.')
  .max(80, 'Keep the name under 80 characters.');

const description = z
  .string()
  .trim()
  .max(500, 'Keep the description under 500 characters.')
  .optional();

/** An identifier from the web icon set ("wrench"), never a URL. */
const icon = z
  .string()
  .trim()
  .max(40)
  .regex(/^[a-z0-9-]+$/, 'Use an icon name from the icon set, such as "wrench".')
  .optional();

export const createServiceCategorySchema = z.object({
  nameEn: name,
  nameFr: name,
  descriptionEn: description,
  descriptionFr: description,
  icon,
  /**
   * Parent for a specialisation. The taxonomy is deliberately TWO levels — a
   * deeper tree is a browsing maze on a phone, and every level of nesting is one
   * more chance for a worker's listing to be filed somewhere nobody looks.
   */
  parentId: z.uuid('Choose a valid parent category.').optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export type CreateServiceCategoryDto = z.infer<typeof createServiceCategorySchema>;

/**
 * Editable fields. `slug` is absent ON PURPOSE and this is the enforcement
 * point: the slug is the stable key saved filters and job posts reference, so it
 * is generated once at creation and is not editable by anyone, including admins.
 */
export const updateServiceCategorySchema = z
  .object({
    nameEn: name.optional(),
    nameFr: name.optional(),
    descriptionEn: description.nullable(),
    descriptionFr: description.nullable(),
    icon: icon.nullable(),
    parentId: z.uuid().nullable().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Change at least one field.',
  });

export type UpdateServiceCategoryDto = z.infer<typeof updateServiceCategorySchema>;

/** Bulk reordering, so an admin can drag the browse list into shape in one save. */
export const reorderServiceCategoriesSchema = z.object({
  order: z
    .array(z.object({ id: z.uuid(), sortOrder: z.number().int().min(0).max(9999) }))
    .min(1, 'Send at least one category.')
    .max(500),
});

export type ReorderServiceCategoriesDto = z.infer<typeof reorderServiceCategoriesSchema>;
