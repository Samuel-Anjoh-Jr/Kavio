import { gql } from '@apollo/client';
import type { VerificationTier } from '@/lib/trust';

/**
 * Saved-worker READS (DUAL API RULE). Writes are the REST `favorites`
 * endpoints under `apps/web/lib/favorites.ts`.
 *
 * Not @Public() on the API: a shortlist is personal, so this query is only
 * ever run for a signed-in identity (see FavoritesProvider, which skips it
 * for guests).
 */
export const MY_FAVORITES_QUERY = gql`
  query MyFavorites {
    myFavorites {
      userId
      name
      avatar
      headline
      city
      tier
      trustScore
      completedJobs
      averageRating
      savedAt
    }
  }
`;

export interface SavedWorker {
  userId: string;
  name: string | null;
  avatar: string | null;
  headline: string | null;
  city: string | null;
  tier: VerificationTier;
  trustScore: number;
  completedJobs: number;
  averageRating: number | null;
  savedAt: string;
}

export interface MyFavoritesQueryResult {
  myFavorites: SavedWorker[];
}
