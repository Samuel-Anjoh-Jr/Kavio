import { LocationSource, PortfolioItemType, PortfolioSlot } from '@kavio/database';
import { z } from 'zod';

/**
 * Owner edit flows (PROMPT 48; PRO-05, PRO-07). REST writes, per the DUAL API RULE.
 *
 * Every message here is written to be READ BY THE WORKER, in the field, on a
 * phone. "Validation failed on field startingPrice" is not a message; "Enter a
 * price in XAF, or leave it blank to say 'ask me'" is. These strings are the
 * English half — the web layer keys its EN/FR copy off the error `code`, and
 * these serve as the fallback and the API contract.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Services (PRO-05)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * XAF has NO minor unit, so every price in the system is a whole-currency
 * integer. The upper bound is a typo guard: 100,000,000 XAF is roughly 150,000
 * EUR, which is not a starting price for a home repair — it is a slipped finger
 * on a keypad, and it would wreck the derived price ranges for everyone
 * searching that category.
 */
const startingPrice = z
  .number()
  .int('Enter a whole number of XAF — there are no centimes.')
  .min(0, 'A price cannot be negative.')
  .max(100_000_000, 'That price looks like a typo. Check the number of zeros.')
  .nullable()
  .optional();

export const createServiceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Give the service a name of at least 3 characters.')
    .max(100, 'Keep the name under 100 characters.'),
  description: z.string().trim().max(1000, 'Keep the description under 1000 characters.').nullish(),
  /**
   * Optional, deliberately. Intake is never blocked on a taxonomy entry an admin
   * has not created yet: the worker describes their trade in their own words and
   * the category is attached afterwards, by them or by moderation. It costs them
   * category-browse visibility, not the listing.
   */
  categoryId: z.uuid('Choose a category from the list.').nullish(),
  startingPrice,
  isActive: z.boolean().optional(),
});

export type CreateServiceDto = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = createServiceSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Change at least one field.' });

export type UpdateServiceDto = z.infer<typeof updateServiceSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio (PRO-02)
// ─────────────────────────────────────────────────────────────────────────────

export const addPortfolioItemSchema = z.object({
  /** An already-uploaded MediaAsset. Upload happens on POST /uploads first. */
  mediaAssetId: z.uuid('Upload the photo first.'),
  type: z.enum(PortfolioItemType).optional(),
  caption: z.string().trim().max(280, 'Keep the caption under 280 characters.').nullish(),
  /**
   * Groups a multi-shot project or a before/after pair. The client generates it
   * (any stable string) and reuses it across the items that belong together.
   */
  groupKey: z.string().trim().min(1).max(64).nullish(),
  projectTitle: z
    .string()
    .trim()
    .max(120, 'Keep the project title under 120 characters.')
    .nullish(),
  slot: z.enum(PortfolioSlot).nullish(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export type AddPortfolioItemDto = z.infer<typeof addPortfolioItemSchema>;

export const updatePortfolioItemSchema = z
  .object({
    caption: z.string().trim().max(280).nullish(),
    groupKey: z.string().trim().min(1).max(64).nullish(),
    projectTitle: z.string().trim().max(120).nullish(),
    slot: z.enum(PortfolioSlot).nullish(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Change at least one field.' });

export type UpdatePortfolioItemDto = z.infer<typeof updatePortfolioItemSchema>;

/** Bulk reorder, so a drag-and-drop gallery saves in one request. */
export const reorderPortfolioSchema = z.object({
  order: z
    .array(z.object({ id: z.uuid(), sortOrder: z.number().int().min(0).max(9999) }))
    .min(1, 'Send at least one item.')
    .max(200),
});

export type ReorderPortfolioDto = z.infer<typeof reorderPortfolioSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Availability (PRO-05)
// ─────────────────────────────────────────────────────────────────────────────

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour times, such as 08:00.');

/**
 * The WHOLE week is replaced in one call rather than patched slot by slot.
 *
 * A schedule is a single mental object — "I work Monday to Friday, half-day
 * Saturday" — and editing it slot-by-slot means the saved state passes through
 * combinations the worker never intended (Saturday added before Friday is
 * removed). One atomic replace also makes overlap validation possible: you
 * cannot check a week for conflicts while only holding one row of it.
 */
export const setAvailabilitySchema = z.object({
  slots: z
    .array(
      z.object({
        dayOfWeek: z
          .number()
          .int()
          .min(0, 'Choose a day of the week.')
          .max(6, 'Choose a day of the week.'),
        startTime: time,
        endTime: time,
      }),
    )
    .max(50, 'That is more slots than a week can hold.'),
});

export type SetAvailabilityDto = z.infer<typeof setAvailabilitySchema>;

export const setAvailabilityExceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
  isAvailable: z.boolean(),
  startTime: time.nullish(),
  endTime: time.nullish(),
  note: z.string().trim().max(120, 'Keep the note under 120 characters.').nullish(),
});

export type SetAvailabilityExceptionDto = z.infer<typeof setAvailabilityExceptionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Profile details (PRO-07)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where the worker works, as they set it themselves (PRO-07, DIS-04).
 *
 * The quarter and town are NOT accepted from the client: they are
 * reverse-geocoded from the pin server-side, so the area a client filters on is
 * always the area the coordinates actually fall in and cannot be typed into
 * something more flattering. `landmark` is the worker's own words — "behind
 * Total Bonapriso" — which is how an address is really given here, and it is
 * additional to the resolved place rather than a substitute for it.
 */
const workerLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  source: z.enum(LocationSource).optional(),
  landmark: z.string().trim().max(160, 'Keep the landmark under 160 characters.').nullish(),
});

export const updateWorkerProfileSchema = z
  .object({
    headline: z.string().trim().max(120, 'Keep the headline under 120 characters.').nullish(),
    bio: z.string().trim().max(2000, 'Keep the description under 2000 characters.').nullish(),
    yearsExperience: z
      .number()
      .int()
      .min(0, 'Years of experience cannot be negative.')
      .max(70, 'Check that number of years.')
      .nullish(),
    coverAssetId: z.uuid().nullish(),
    /** Null clears the location entirely — "I would rather not say where". */
    location: workerLocationSchema.nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Change at least one field.' });

export type UpdateWorkerProfileDto = z.infer<typeof updateWorkerProfileSchema>;

export const updateBusinessProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter the company name.').max(120).optional(),
    description: z.string().trim().max(2000).nullish(),
    contactEmail: z.email('Enter a valid email address.').nullish(),
    contactPhone: z.string().trim().max(20).nullish(),
    address: z.string().trim().max(200).nullish(),
    logoAssetId: z.uuid().nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Change at least one field.' });

export type UpdateBusinessProfileDto = z.infer<typeof updateBusinessProfileSchema>;
