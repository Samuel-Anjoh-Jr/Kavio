-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPT 38 — Spatial schema and OSM warehouse (SRS §12)
--
-- PostGIS becomes the authoritative home for every spatial fact. Mapbox paints,
-- CARTO queries, BigDataCloud names — none of them decide a distance.
--
-- Three Postgres schemas, three owners:
--   public  Prisma's tables, plus geography columns Prisma declares Unsupported
--   osm     the OpenStreetMap warehouse, owned by the ingest script
--   geo     reviewed READ views + functions, the only spatial surface the API uses
--
-- `osm` and `geo` exist so Prisma never sees them. Prisma cannot describe a
-- GIST index, a geography type or a view, so anything of the sort left in
-- `public` shows up as drift and `migrate dev` offers to drop it. Moving them
-- out is what makes "complex spatial ops via reviewed raw SQL, not Prisma
-- fields" survivable rather than a standing footgun.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS postgis;

-- Create schemas if they don't exist using DO blocks
DO $$ 
BEGIN
    CREATE SCHEMA osm;
EXCEPTION
    WHEN duplicate_schema THEN RAISE NOTICE 'schema osm already exists';
END $$;

DO $$ 
BEGIN
    CREATE SCHEMA geo;
EXCEPTION
    WHEN duplicate_schema THEN RAISE NOTICE 'schema geo already exists';
END $$;

COMMENT ON SCHEMA osm IS 'OpenStreetMap warehouse. Written only by scripts/ingest-osm.mjs; never by the API.';
COMMENT ON SCHEMA geo IS 'Reviewed spatial read views and functions. The API''s only spatial surface.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Administrative regions.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "GeoRegionLevel" AS ENUM ('COUNTRY', 'REGION', 'CITY', 'DISTRICT', 'NEIGHBOURHOOD');

-- CreateTable
CREATE TABLE IF NOT EXISTS "GeoRegion" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "level" "GeoRegionLevel" NOT NULL,
    "parentId" UUID,
    "osmId" BIGINT,
    "areaSqKm" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeoRegion_pkey" PRIMARY KEY ("id")
);

-- Geography columns are added separately: Prisma writes them as `Unsupported`,
-- and keeping their DDL here (rather than inline above) is a reminder that the
-- ORM does not manage them.
-- Use DO blocks for PostgreSQL versions that don't support IF NOT EXISTS on ADD COLUMN
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE "GeoRegion" ADD COLUMN "boundary" geography(MultiPolygon, 4326);
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column boundary already exists in GeoRegion';
    END;
END $$;

DO $$ 
BEGIN
    BEGIN
        ALTER TABLE "GeoRegion" ADD COLUMN "center" geography(Point, 4326);
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column center already exists in GeoRegion';
    END;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GeoRegion_slug_key" ON "GeoRegion"("slug");
CREATE INDEX IF NOT EXISTS "GeoRegion_level_isActive_idx" ON "GeoRegion"("level", "isActive");
CREATE INDEX IF NOT EXISTS "GeoRegion_parentId_idx" ON "GeoRegion"("parentId");
CREATE INDEX IF NOT EXISTS "GeoRegion_osmId_idx" ON "GeoRegion"("osmId");
CREATE INDEX IF NOT EXISTS "GeoRegion_boundary_gist" ON "GeoRegion" USING GIST ("boundary");
CREATE INDEX IF NOT EXISTS "GeoRegion_center_gist" ON "GeoRegion" USING GIST ("center");

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "GeoRegion" ADD CONSTRAINT "GeoRegion_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "GeoRegion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN RAISE NOTICE 'constraint GeoRegion_parentId_fkey already exists';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Operational coordinates on the three profile types.
--
-- The plain latitude/longitude floats stay: they are what onboarding captures
-- and what a form edits. `location` is DERIVED from them by the trigger below,
-- so there is exactly one writable source of truth and no way for the indexed
-- geometry to disagree with the number a user typed.
-- ─────────────────────────────────────────────────────────────────────────────

-- Use DO blocks for adding columns to WorkerProfile
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE "WorkerProfile" ADD COLUMN "landmark" TEXT;
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column landmark already exists in WorkerProfile';
    END;
END $$;

DO $$ 
BEGIN
    BEGIN
        ALTER TABLE "WorkerProfile" ADD COLUMN "locationUpdatedAt" TIMESTAMP(3);
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column locationUpdatedAt already exists in WorkerProfile';
    END;
END $$;

DO $$ 
BEGIN
    BEGIN
        ALTER TABLE "WorkerProfile" ADD COLUMN "geoRegionId" UUID;
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column geoRegionId already exists in WorkerProfile';
    END;
END $$;

DO $$ 
BEGIN
    BEGIN
        ALTER TABLE "WorkerProfile" ADD COLUMN "location" geography(Point, 4326);
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column location already exists in WorkerProfile';
    END;
END $$;

-- Use DO blocks for adding columns to ClientProfile
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE "ClientProfile" ADD COLUMN "landmark" TEXT;
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column landmark already exists in ClientProfile';
    END;
END $$;

DO $$ 
BEGIN
    BEGIN
        ALTER TABLE "ClientProfile" ADD COLUMN "locationUpdatedAt" TIMESTAMP(3);
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column locationUpdatedAt already exists in ClientProfile';
    END;
END $$;

DO $$ 
BEGIN
    BEGIN
        ALTER TABLE "ClientProfile" ADD COLUMN "geoRegionId" UUID;
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column geoRegionId already exists in ClientProfile';
    END;
END $$;

DO $$ 
BEGIN
    BEGIN
        ALTER TABLE "ClientProfile" ADD COLUMN "location" geography(Point, 4326);
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column location already exists in ClientProfile';
    END;
END $$;

-- Use DO blocks for adding columns to BusinessProfile
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE "BusinessProfile" ADD COLUMN "landmark" TEXT;
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column landmark already exists in BusinessProfile';
    END;
END $$;

DO $$ 
BEGIN
    BEGIN
        ALTER TABLE "BusinessProfile" ADD COLUMN "locationUpdatedAt" TIMESTAMP(3);
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column locationUpdatedAt already exists in BusinessProfile';
    END;
END $$;

DO $$ 
BEGIN
    BEGIN
        ALTER TABLE "BusinessProfile" ADD COLUMN "geoRegionId" UUID;
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column geoRegionId already exists in BusinessProfile';
    END;
END $$;

DO $$ 
BEGIN
    BEGIN
        ALTER TABLE "BusinessProfile" ADD COLUMN "location" geography(Point, 4326);
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column location already exists in BusinessProfile';
    END;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkerProfile_geoRegionId_idx" ON "WorkerProfile"("geoRegionId");
CREATE INDEX IF NOT EXISTS "ClientProfile_geoRegionId_idx" ON "ClientProfile"("geoRegionId");
CREATE INDEX IF NOT EXISTS "BusinessProfile_geoRegionId_idx" ON "BusinessProfile"("geoRegionId");

-- CreateIndex (GIST — KNN and radius search, PROMPT 40)
--
-- Partial on `location IS NOT NULL`: a profile without coordinates can never
-- satisfy a proximity query, so indexing it only makes every nearby search
-- read more pages. Most Client profiles will never set a location at all.
CREATE INDEX IF NOT EXISTS "WorkerProfile_location_gist" ON "WorkerProfile" USING GIST ("location") WHERE "location" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ClientProfile_location_gist" ON "ClientProfile" USING GIST ("location") WHERE "location" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "BusinessProfile_location_gist" ON "BusinessProfile" USING GIST ("location") WHERE "location" IS NOT NULL;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_geoRegionId_fkey" FOREIGN KEY ("geoRegionId") REFERENCES "GeoRegion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN RAISE NOTICE 'constraint WorkerProfile_geoRegionId_fkey already exists';
END $$;

DO $$
BEGIN
    ALTER TABLE "ClientProfile" ADD CONSTRAINT "ClientProfile_geoRegionId_fkey" FOREIGN KEY ("geoRegionId") REFERENCES "GeoRegion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN RAISE NOTICE 'constraint ClientProfile_geoRegionId_fkey already exists';
END $$;

DO $$
BEGIN
    ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_geoRegionId_fkey" FOREIGN KEY ("geoRegionId") REFERENCES "GeoRegion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN RAISE NOTICE 'constraint BusinessProfile_geoRegionId_fkey already exists';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Keeping `location` in step with the floats.
--
-- A trigger rather than a GENERATED column: Prisma has no concept of generated
-- columns and would report the table as drifted on every check. A trigger is
-- invisible to Prisma and gives the same guarantee, the ORM can write only
-- latitude/longitude, and the geography follows on the same statement.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trustpro_sync_location() RETURNS TRIGGER AS $$
BEGIN
    IF NEW."latitude" IS NULL OR NEW."longitude" IS NULL THEN
        NEW."location" := NULL;
    ELSE
        -- ST_MakePoint takes (X, Y) = (LONGITUDE, LATITUDE). Reversing these is
        -- the single most common PostGIS bug and it fails quietly: Douala's
        -- (4.05, 9.77) becomes a point in the Indian Ocean off Somalia, which is
        -- a perfectly valid coordinate that simply matches nothing.
        NEW."location" := ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trustpro_sync_location() IS 'Derives the GIST-indexed geography column from the latitude/longitude a form wrote. See migration 20260721171000.';

-- PostgreSQL doesn't support IF NOT EXISTS for triggers. Use DROP IF EXISTS first.
DROP TRIGGER IF EXISTS "WorkerProfile_sync_location" ON "WorkerProfile";
CREATE TRIGGER "WorkerProfile_sync_location"
    BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "WorkerProfile"
    FOR EACH ROW EXECUTE FUNCTION trustpro_sync_location();

DROP TRIGGER IF EXISTS "ClientProfile_sync_location" ON "ClientProfile";
CREATE TRIGGER "ClientProfile_sync_location"
    BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "ClientProfile"
    FOR EACH ROW EXECUTE FUNCTION trustpro_sync_location();

DROP TRIGGER IF EXISTS "BusinessProfile_sync_location" ON "BusinessProfile";
CREATE TRIGGER "BusinessProfile_sync_location"
    BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "BusinessProfile"
    FOR EACH ROW EXECUTE FUNCTION trustpro_sync_location();

-- Backfill any rows that already carry coordinates from onboarding. The trigger
-- only fires on write, so without this an existing worker stays invisible to
-- every proximity query despite having a perfectly good position on file.
-- The WHERE clause needs to actually match rows; updating latitude to itself is
-- a no-op that still fires the trigger, but only on rows that have non-null values.
UPDATE "WorkerProfile" SET "latitude" = "latitude" WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;
UPDATE "ClientProfile" SET "latitude" = "latitude" WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;
UPDATE "BusinessProfile" SET "latitude" = "latitude" WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- The OSM warehouse.
--
-- Populated by `pnpm db:osm:ingest` (Overpass extracts for Douala + Yaoundé).
-- `osm_id` is the natural primary key: it is stable across extracts, which is
-- what makes re-ingesting an UPSERT rather than a truncate-and-reload that would
-- briefly leave the map empty.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop tables if they exist (safer for reset scenarios)
DROP TABLE IF EXISTS osm.poi CASCADE;
DROP TABLE IF EXISTS osm.road CASCADE;
DROP TABLE IF EXISTS osm.boundary CASCADE;

CREATE TABLE osm.boundary (
    osm_id BIGINT PRIMARY KEY,
    name TEXT,
    name_en TEXT,
    name_fr TEXT,
    -- OSM's own admin_level (2 = country … 10 = suburb). Kept raw rather than
    -- mapped to GeoRegionLevel here, so a mapping change is a code change and
    -- not a re-ingest of the whole city.
    admin_level INTEGER,
    tags JSONB NOT NULL DEFAULT '{}'::jsonb,
    geom geography(MultiPolygon, 4326) NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS boundary_geom_gist ON osm.boundary USING GIST (geom);
CREATE INDEX IF NOT EXISTS boundary_admin_level_idx ON osm.boundary (admin_level);

CREATE TABLE osm.road (
    osm_id BIGINT PRIMARY KEY,
    name TEXT,
    -- OSM `highway` tag: primary, residential, track…
    highway TEXT,
    tags JSONB NOT NULL DEFAULT '{}'::jsonb,
    geom geography(LineString, 4326) NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS road_geom_gist ON osm.road USING GIST (geom);
CREATE INDEX IF NOT EXISTS road_name_idx ON osm.road (name);

CREATE TABLE osm.poi (
    osm_id BIGINT PRIMARY KEY,
    name TEXT,
    -- Normalised bucket (amenity/shop/office value) — what a landmark search
    -- actually filters on. The untouched OSM tags stay in `tags`.
    category TEXT,
    tags JSONB NOT NULL DEFAULT '{}'::jsonb,
    geom geography(Point, 4326) NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS poi_geom_gist ON osm.poi USING GIST (geom);
CREATE INDEX IF NOT EXISTS poi_category_idx ON osm.poi (category);
CREATE INDEX IF NOT EXISTS poi_name_idx ON osm.poi (name);

-- ─────────────────────────────────────────────────────────────────────────────
-- Reviewed read views.
--
-- Every spatial read in the API goes through `geo.*`. The rule earns its keep by
-- being enforceable: a raw ST_Distance in a service is reviewable as a mistake,
-- because the correct version already exists here.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop views if they exist (for reset scenarios)
DROP VIEW IF EXISTS geo.worker_location CASCADE;
DROP VIEW IF EXISTS geo.region CASCADE;

-- Regions, flattened for the picker: coordinates as plain numbers so the API
-- never has to parse WKB, and the parent's name so a quarter renders as
-- "Akwa, Douala" without a second query.
CREATE VIEW geo.region AS
SELECT
    r."id",
    r."slug",
    r."nameEn",
    r."nameFr",
    r."level",
    r."parentId",
    p."nameEn" AS parent_name_en,
    p."nameFr" AS parent_name_fr,
    r."osmId",
    r."areaSqKm",
    r."isActive",
    ST_Y(r."center"::geometry) AS latitude,
    ST_X(r."center"::geometry) AS longitude,
    -- True once the ingest has replaced the seeded approximation with a real
    -- OSM polygon. The API surfaces this rather than pretending both are equal.
    (r."osmId" IS NOT NULL) AS boundary_is_authoritative
FROM "GeoRegion" r
LEFT JOIN "GeoRegion" p ON p."id" = r."parentId";

COMMENT ON VIEW geo.region IS 'Administrative regions with plain-number coordinates for API reads (PROMPT 38).';

-- The discovery base view: every worker who is eligible to appear in a search,
-- with the trust signals that rank them and the location that filters them.
--
-- Eligibility is decided HERE, once, rather than in each caller: the user is
-- ACTIVE, the Trust Engine has not suspended them for fraudulent documents, and
-- they have a position on file. A caller that forgot one of those clauses would
-- be showing suspended accounts on a trust-first marketplace.
CREATE VIEW geo.worker_location AS
SELECT
    w."id" AS worker_profile_id,
    w."userId" AS user_id,
    u."name",
    u."avatar",
    w."headline",
    w."yearsExperience",
    w."city",
    w."area",
    w."landmark",
    w."geoRegionId" AS geo_region_id,
    g."slug" AS region_slug,
    g."nameEn" AS region_name_en,
    g."nameFr" AS region_name_fr,
    u."tier",
    -- A worker with no TrustScore row has simply not been scored yet; COALESCE
    -- to 0 keeps them findable and ranked last rather than dropping them.
    COALESCE(ts."total", 0) AS trust_score,
    COALESCE(ts."completedJobs", 0) AS completed_jobs,
    ts."averageRating" AS average_rating,
    w."locationSource" AS location_source,
    w."locationUpdatedAt" AS location_updated_at,
    ST_Y(w."location"::geometry) AS latitude,
    ST_X(w."location"::geometry) AS longitude,
    w."location"
FROM "WorkerProfile" w
JOIN "User" u ON u."id" = w."userId"
LEFT JOIN "TrustScore" ts ON ts."subjectId" = w."userId"
LEFT JOIN "GeoRegion" g ON g."id" = w."geoRegionId"
WHERE w."location" IS NOT NULL
  AND u."status" = 'ACTIVE'
  AND COALESCE(ts."suspended", false) = false;

COMMENT ON VIEW geo.worker_location IS 'Search-eligible workers with position and trust ranking inputs (PROMPT 38, DIS-08).';
