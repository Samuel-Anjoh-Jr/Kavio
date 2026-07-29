import { Query, Resolver } from '@nestjs/graphql';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/auth.decorators';
import { FavoritesService } from './favorites.service';
import { SavedWorkerView } from './models/favorite.model';

/**
 * Saved-worker reads, GraphQL-only per the DUAL API RULE. NOT @Public(): a
 * shortlist is personal, not evidence offered to strangers the way an
 * endorsement or a Trust Score is.
 */
@Resolver()
export class FavoritesResolver {
  constructor(private readonly favorites: FavoritesService) {}

  @Query(() => [SavedWorkerView], {
    description:
      'The signed-in identity’s saved workers, newest first. A worker card anywhere reads its own id off this list to show whether it is already saved.',
  })
  async myFavorites(@CurrentUser() user: AuthenticatedUser): Promise<SavedWorkerView[]> {
    return this.favorites.listMine(user.id);
  }
}
