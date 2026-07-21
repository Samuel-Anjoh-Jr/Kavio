import { LocationSource } from '@trustpro/database';
import { z } from 'zod';

/**
 * Location write validation (PROMPT 39, DIS-09).
 *
 * Validated at the boundary before anything reaches the database, per the
 * engineering standards. The coordinate ranges are re-checked in
 * `assertValidCoordinates` so the rule holds for GraphQL callers too — a
 * validation rule that only one transport enforces is not enforced.
 */
export const setLocationSchema = z.object({
  latitude: z
    .number({ message: 'Latitude is required.' })
    .min(-90, 'Latitude must be between -90 and 90.')
    .max(90, 'Latitude must be between -90 and 90.'),
  longitude: z
    .number({ message: 'Longitude is required.' })
    .min(-180, 'Longitude must be between -180 and 180.')
    .max(180, 'Longitude must be between -180 and 180.'),

  /**
   * Where the position came from. The client is trusted to report this
   * honestly because there is nothing to gain by lying: HUMAN_INPUT only ever
   * grants the position MORE protection from being overwritten, never a
   * ranking or visibility advantage.
   */
  source: z.enum(LocationSource),

  /**
   * The user's own landmark note. Generous but bounded — long enough for
   * "Carrefour Ndokotti, behind the pharmacy, blue gate", short enough not to
   * become a free-text field people paste essays into.
   */
  landmark: z.string().trim().max(200, 'Keep the landmark under 200 characters.').nullish(),

  /**
   * Explicit consent to replace a pin the user placed by hand. Absent or false,
   * an automatic fix that would overwrite a human pin is refused and reported
   * back as `applied: false` — see LocationService for why.
   */
  overrideHumanPin: z.boolean().optional(),

  /** Language for the resolved area name. Falls back to the account locale. */
  locale: z.string().max(10).optional(),
});

export type SetLocationDto = z.infer<typeof setLocationSchema>;
