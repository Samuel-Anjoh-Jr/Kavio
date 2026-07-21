import { z } from 'zod';

/**
 * The Campay webhook payload (PAY-06). Validated before a byte is trusted — a
 * webhook is an unauthenticated POST from the internet, so it is parsed into a
 * typed shape and its signature verified before it can move any money.
 */
export const campayWebhookSchema = z.object({
  reference: z.string().min(1),
  external_reference: z.string().min(1),
  status: z.string().min(1),
  amount: z.string().optional().default('0'),
  currency: z.string().optional().default('XAF'),
  operator: z.string().optional(),
  code: z.string().optional(),
  operator_reference: z.string().optional(),
  endpoint: z.string().optional(),
  signature: z.string().optional(),
  reason: z.string().optional(),
});

export type CampayWebhookDto = z.infer<typeof campayWebhookSchema>;
