import { z } from 'zod';

/**
 * Payload for the dev-only test-dispatch endpoint. Either a userId (preferences
 * apply) or an explicit email (pre-account path) must be supplied.
 */
export const testDispatchSchema = z
  .object({
    userId: z.string().uuid('Provide a valid user id.').optional(),
    email: z.string().email('Provide a valid email address.').optional(),
    message: z.string().trim().min(1).max(200).default('Dispatcher smoke test'),
    locale: z.enum(['en', 'fr']).optional(),
  })
  .refine((value) => Boolean(value.userId ?? value.email), {
    message: 'Provide either a userId or an email address.',
    path: ['userId'],
  });

export type TestDispatchDto = z.infer<typeof testDispatchSchema>;
