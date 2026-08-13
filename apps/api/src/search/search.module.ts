import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FeaturedModule } from '../featured/featured.module';
import { SearchFiltersService } from './search-filters.service';
import { SearchResolver } from './search.resolver';
import { SearchService } from './search.service';

/**
 * Worker search (PROMPTS 44-45; DIS-04…DIS-08).
 *
 * Read-only, so there is no controller: every write that could affect a result
 * — a service listed, a location set, a verification approved — belongs to the
 * module that owns that fact.
 *
 * Registered after CatalogModule and GeoModule. It depends on both (the
 * taxonomy scopes matching, PostGIS decides distance) but injects neither: the
 * dependency is expressed in SQL, through the `search` schema's functions,
 * which is what keeps ranking, filtering and distance agreeing with each other.
 *
 * FeaturedModule is the one deliberate exception. Whether a listing is
 * currently APPROVED-and-paying-for-placement is not a fact `search.workers()`
 * can derive — unlike proximity or taxonomy, it has nothing to do with how well
 * a worker matches the query — so it is looked up here and applied on top of
 * the SQL ranking, never inside it.
 */
@Module({
  imports: [PrismaModule, FeaturedModule],
  providers: [SearchService, SearchFiltersService, SearchResolver],
  exports: [SearchService, SearchFiltersService],
})
export class SearchModule {}
