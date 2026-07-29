import { z } from 'zod';

/** Saving a worker (REST write, per the DUAL API RULE). */
export const saveFavoriteSchema = z.object({
  workerId: z.uuid({ message: 'That profile reference is not valid.' }),
});

export type SaveFavoriteDto = z.infer<typeof saveFavoriteSchema>;
