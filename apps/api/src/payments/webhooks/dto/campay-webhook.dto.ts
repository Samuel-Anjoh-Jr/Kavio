import { z } from 'zod';

/**
 * Campay's own reference format (ours: `dep_########_########` /
 * `wd_########_########`; theirs: an opaque alphanumeric token). Both fit this
 * allowlist, which is the shape that ever reaches a `where`/`data` clause —
 * anything outside it is rejected before it gets near the database.
 */
const campayReference = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.:-]+$/);

/**
 * The Campay webhook payload (PAY-06). Validated before a byte is trusted — a
 * webhook is an unauthenticated POST from the internet, so it is parsed into a
 * typed shape and its signature verified before it can move any money.
 */
export const campayWebhookSchema = z.object({
  reference: campayReference,
  external_reference: campayReference,
  status: z.string().min(1).max(64),
  amount: z.string().optional().default('0'),
  currency: z.string().optional().default('XAF'),
  operator: z.string().optional(),
  code: z.string().optional(),
  operator_reference: z.string().optional(),
  endpoint: z.string().optional(),
  signature: z.string().optional(),
  reason: z.string().max(256).optional(),
});

export type CampayWebhookDto = z.infer<typeof campayWebhookSchema>;
