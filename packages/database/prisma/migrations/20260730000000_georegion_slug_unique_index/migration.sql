-- Fix schema drift: "GeoRegion_slug_key" (20260721171000_spatial_postgis_osm)
-- was created as a plain, non-unique index, not the UNIQUE index that
-- schema.prisma's `slug String @unique` has always required. `slug` was
-- therefore never actually enforced unique at the database level, even
-- though the app treats it as a stable, collision-free key (saved searches,
-- shared links, region lookups).
--
-- Recreated under the same name Prisma expects for a `@unique` scalar field
-- ("<Table>_<column>_key"), so this also resolves the corresponding
-- schema-drift gate finding. If duplicate slugs exist, this fails loudly
-- (transactional migration, nothing partially applied) rather than silently
-- leaving the gap in place.
DROP INDEX IF EXISTS "GeoRegion_slug_key";
CREATE UNIQUE INDEX "GeoRegion_slug_key" ON "GeoRegion"("slug");
