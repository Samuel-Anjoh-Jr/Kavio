import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
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
 */
@Module({
  imports: [PrismaModule],
  providers: [SearchService, SearchFiltersService, SearchResolver],
  exports: [SearchService, SearchFiltersService],
})
export class SearchModule {}
