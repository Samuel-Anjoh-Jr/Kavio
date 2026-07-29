import { QuoteDurationUnit } from '@kavio/database';
import { z } from 'zod';

/**
 * Quote and booking writes (PROMPTS 59, 60; QTE-01, QTE-03). REST, per the DUAL
 * API RULE. Messages are written for a worker composing on a phone.
 */

/** Whole XAF — no minor unit. Same typo guard as everywhere else money is typed. */
const price = z
  .number()
  .int('Enter a whole number of XAF — there are no centimes.')
  .min(1, 'Enter a price greater than zero.')
  .max(100_000_000, 'That price looks like a typo. Check the number of zeros.');

const durationValue = z
  .number()
  .int('Enter a whole number.')
  .min(1, 'Enter how long the work will take.')
  .max(999, 'That duration looks too large.');

const includes = z
  .array(z.string().trim().min(1).max(200))
  .max(20, 'List up to 20 items.')
  .optional();

/**
 * Composing a quote (QTE-01). Used both to save a DRAFT and, with `send: true`,
 * to author-and-send in one call — the common path, since most workers write a
 * quote and send it rather than parking a draft.
 */
export const createQuoteSchema = z
  .object({
    /** The application this grew out of, if any. */
    applicationId: z.uuid().nullish(),
    price,
    durationValue: durationValue.nullish(),
    durationUnit: z.enum(QuoteDurationUnit).nullish(),
    includes,
    message: z.string().trim().max(2000, 'Keep the message under 2000 characters.').nullish(),
    /** Already-uploaded QUOTE_ATTACHMENT assets. Upload happens first. */
    attachmentAssetIds: z.array(z.uuid()).max(6, 'Attach up to 6 files.').optional(),
    expiresAt: z.string().datetime('Use an ISO 8601 timestamp.').nullish(),
    /** Send immediately rather than saving a draft. */
    send: z.boolean().optional(),
  })
  .refine((v) => v.durationValue == null || v.durationUnit != null, {
    message: 'Choose a unit for the duration (hours, days or weeks).',
    path: ['durationUnit'],
  });

export type CreateQuoteDto = z.infer<typeof createQuoteSchema>;

/** Editing a still-DRAFT quote. At least one field must change. */
export const updateQuoteSchema = z
  .object({
    price: price.optional(),
    durationValue: durationValue.nullish(),
    durationUnit: z.enum(QuoteDurationUnit).nullish(),
    includes,
    message: z.string().trim().max(2000).nullish(),
    attachmentAssetIds: z.array(z.uuid()).max(6).optional(),
    expiresAt: z.string().datetime().nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Change at least one field.' });

export type UpdateQuoteDto = z.infer<typeof updateQuoteSchema>;

/**
 * A counter-offer from the worker (QTE-03). A revision is a NEW quote chained to
 * the one it supersedes, so it carries a full offer, not a delta.
 */
export const reviseQuoteSchema = createQuoteSchema;
export type ReviseQuoteDto = CreateQuoteDto;

/** The client declining a quote (QTE-02), optionally saying why. */
export const declineQuoteSchema = z.object({
  reason: z.string().trim().max(500, 'Keep the reason under 500 characters.').nullish(),
});

export type DeclineQuoteDto = z.infer<typeof declineQuoteSchema>;

/** The client asking for a counter-offer (QTE-02). */
export const requestCounterSchema = z
  .object({
    targetPrice: price.nullish(),
    message: z.string().trim().max(1000, 'Keep the message under 1000 characters.').nullish(),
  })
  .refine((v) => v.targetPrice != null || (v.message && v.message.length > 0), {
    message: 'Suggest a price or say what you would like changed.',
    path: ['message'],
  });

export type RequestCounterDto = z.infer<typeof requestCounterSchema>;
