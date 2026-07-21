-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPT 40 — Proximity, distance and within-region queries (DIS-06, DIS-07)
--
-- All spatial math is server-side. The client sends a point and a radius; it
-- never receives a coordinate list to measure for itself, because a phone doing
-- haversine over 500 workers is both slower and — once ranking, tier weighting
-- and region containment enter the picture — quietly wrong.
--
-- Everything here is a FUNCTION rather than a view because every one of these
-- reads is parameterised by a point. `geo.worker_location` (PROMPT 38) stays the
-- single definition of who is eligible to be found; these only order and filter.
--
-- ── What makes these fast, and what does not ────────────────────────────────
-- The GIST index does the work in the WHERE clause: ST_DWithin narrows the
-- table to the workers inside the radius before anything is measured.
--
-- The ORDER BY is then a plain sort over that bounded set. It is worth being
-- precise about why, because the `<->` KNN operator is the usual reflex here
-- and it would buy nothing: KNN's index-ordered scan only pays off when the
-- planner can stop early at LIMIT, and `total_count` — a window function over
-- every match — means the whole matched set has to be visited regardless. Since
-- the radius has already bounded that set, sorting it is cheap, and we get an
-- exact count of what is out there instead of a page with no idea of its total.
--
-- That count is not a nicety: DIS-06 requires telling a user "no providers here
-- yet" rather than showing an ambiguous empty list, and that is a different
-- statement from "no more results on this page".
-- ─────────────────────────────────────────────────────────────────────────────

-- Distance between two positions, in metres, on the spheroid. Exposed so a
-- caller that has two known points ("how far is this job from me?") does not
-- reach for a client-side formula.
CREATE OR REPLACE FUNCTION geo.distance_m(
    p_lat_a DOUBLE PRECISION,
    p_lng_a DOUBLE PRECISION,
    p_lat_b DOUBLE PRECISION,
    p_lng_b DOUBLE PRECISION
) RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint(p_lng_a, p_lat_a), 4326)::geography,
        ST_SetSRID(ST_MakePoint(p_lng_b, p_lat_b), 4326)::geography
    );
$$;

COMMENT ON FUNCTION geo.distance_m IS 'Spheroidal distance in metres between two lat/lng pairs (DIS-07).';

-- ─────────────────────────────────────────────────────────────────────────────
-- The most specific region containing a point.
--
-- Used by reverse-geocoding (PROMPT 39) as the offline/authoritative answer:
-- BigDataCloud names an area quickly, but OUR boundaries are what the rest of
-- the system filters on, so the row id has to come from here either way.
--
-- "Most specific" is ordered by boundary area, not by `level`: administrative
-- levels are not uniformly nested in practice, and the smallest polygon that
-- actually contains the point is the honest answer to "where is this?".
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION geo.region_at_point(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION
) RETURNS TABLE (
    id UUID,
    slug TEXT,
    name_en TEXT,
    name_fr TEXT,
    level "GeoRegionLevel",
    parent_id UUID,
    area_sq_km DOUBLE PRECISION
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    SELECT
        r."id",
        r."slug",
        r."nameEn",
        r."nameFr",
        r."level",
        r."parentId",
        r."areaSqKm"
    FROM public."GeoRegion" r
    WHERE r."isActive"
      AND r."boundary" IS NOT NULL
      -- ST_Covers (not ST_Within) so a point exactly on a boundary line still
      -- resolves; a pin dropped on a road that forms a quarter's edge is a
      -- normal event, not an unlocatable one.
      AND ST_Covers(r."boundary", ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)
    ORDER BY COALESCE(r."areaSqKm", 'Infinity'::double precision) ASC
    LIMIT 1;
$$;

COMMENT ON FUNCTION geo.region_at_point IS 'Smallest active region whose boundary covers the point (PROMPT 39/40).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Nearby workers — the query the discovery feed is built on.
--
-- Ranking is distance-first with trust as the tie-break, which is deliberate:
-- proximity is what the user asked for, and DIS-08's priority placement for
-- higher-tier workers is applied by the search layer (PROMPT 44/45) on top of
-- this result set. Baking score weighting in here would make "nearby" quietly
-- mean something else and leave the search module unable to un-bake it.
--
-- `total_count` rides along as a window function so the caller learns "0 results
-- in this radius" from the same round-trip that returns the page — that count is
-- what the friendly no-provider message (DIS-06) is decided on.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION geo.nearby_workers(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_radius_m DOUBLE PRECISION,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0,
    p_category_id UUID DEFAULT NULL,
    p_min_trust_score INTEGER DEFAULT 0,
    p_region_id UUID DEFAULT NULL
) RETURNS TABLE (
    worker_profile_id UUID,
    user_id UUID,
    name TEXT,
    avatar TEXT,
    headline TEXT,
    city TEXT,
    area TEXT,
    landmark TEXT,
    region_slug TEXT,
    region_name_en TEXT,
    region_name_fr TEXT,
    tier "VerificationTier",
    trust_score INTEGER,
    completed_jobs INTEGER,
    average_rating NUMERIC,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    distance_m DOUBLE PRECISION,
    total_count BIGINT
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    WITH origin AS (
        SELECT ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography AS g
    ),
    matched AS (
        SELECT
            w.*,
            ST_Distance(w."location", o.g) AS distance_m
        FROM geo.worker_location w
        CROSS JOIN origin o
        -- ST_DWithin is the index-using predicate. Writing the same test as
        -- `ST_Distance(w."location", o.g) <= p_radius_m` would be logically
        -- identical and would silently disable the GIST index, turning every
        -- search into a full scan that measures the distance to every worker
        -- in the country.
        WHERE ST_DWithin(w."location", o.g, p_radius_m)
          AND w.trust_score >= p_min_trust_score
          AND (p_region_id IS NULL OR w.geo_region_id = p_region_id)
          AND (
              p_category_id IS NULL
              OR EXISTS (
                  SELECT 1
                  FROM public."Service" s
                  WHERE s."workerProfileId" = w.worker_profile_id
                    AND s."isActive"
                    AND s."categoryId" = p_category_id
              )
          )
    )
    SELECT
        m.worker_profile_id,
        m.user_id,
        m.name,
        m.avatar,
        m.headline,
        m.city,
        m.area,
        m.landmark,
        m.region_slug,
        m.region_name_en,
        m.region_name_fr,
        m.tier,
        m.trust_score,
        m.completed_jobs,
        m.average_rating,
        m.latitude,
        m.longitude,
        m.distance_m,
        COUNT(*) OVER () AS total_count
    FROM matched m
    -- Ordering on the distance already computed above, rather than recomputing
    -- it as `m."location" <-> o.g`. Same order, one measurement per row.
    --
    -- worker_profile_id breaks the final tie so paging is STABLE: without it,
    -- two workers at an identical distance and score could swap places between
    -- page one and page two and the client would show one of them twice.
    ORDER BY m.distance_m, m.trust_score DESC, m.worker_profile_id
    LIMIT GREATEST(p_limit, 0)
    OFFSET GREATEST(p_offset, 0);
$$;

COMMENT ON FUNCTION geo.nearby_workers IS 'Distance-ranked workers within a radius, with total_count for the no-provider signal (DIS-06, DIS-07).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Workers inside a named region, regardless of distance.
--
-- Containment is computed against the boundary rather than trusting the
-- denormalised `geoRegionId`: that column records where a worker was when their
-- location was last resolved, while a boundary can be corrected by a later OSM
-- ingest. The polygon is the authority; the column is a cache.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION geo.workers_in_region(
    p_region_id UUID,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0,
    p_include_children BOOLEAN DEFAULT TRUE
) RETURNS TABLE (
    worker_profile_id UUID,
    user_id UUID,
    name TEXT,
    avatar TEXT,
    headline TEXT,
    city TEXT,
    area TEXT,
    landmark TEXT,
    tier "VerificationTier",
    trust_score INTEGER,
    completed_jobs INTEGER,
    average_rating NUMERIC,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    total_count BIGINT
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    WITH RECURSIVE subtree AS (
        SELECT r."id", r."boundary"
        FROM public."GeoRegion" r
        WHERE r."id" = p_region_id AND r."isActive"
        UNION ALL
        SELECT c."id", c."boundary"
        FROM public."GeoRegion" c
        JOIN subtree s ON c."parentId" = s."id"
        WHERE p_include_children AND c."isActive"
    ),
    -- One union'd polygon, so a worker sitting in two overlapping child
    -- boundaries is counted once rather than appearing twice in the page.
    footprint AS (
        SELECT ST_Union(s."boundary"::geometry)::geography AS g
        FROM subtree s
        WHERE s."boundary" IS NOT NULL
    ),
    matched AS (
        SELECT w.*
        FROM geo.worker_location w
        CROSS JOIN footprint f
        WHERE f.g IS NOT NULL
          AND ST_Covers(f.g, w."location")
    )
    SELECT
        m.worker_profile_id,
        m.user_id,
        m.name,
        m.avatar,
        m.headline,
        m.city,
        m.area,
        m.landmark,
        m.tier,
        m.trust_score,
        m.completed_jobs,
        m.average_rating,
        m.latitude,
        m.longitude,
        COUNT(*) OVER () AS total_count
    FROM matched m
    ORDER BY m.trust_score DESC, m.worker_profile_id
    LIMIT GREATEST(p_limit, 0)
    OFFSET GREATEST(p_offset, 0);
$$;

COMMENT ON FUNCTION geo.workers_in_region IS 'Workers whose position falls inside a region (optionally its whole subtree).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Nearby OSM landmarks.
--
-- "Behind the Total station in Bonapriso" is how an address is actually given
-- in Douala. Offering the real landmarks near a dropped pin turns that habit
-- into structured data instead of fighting it (SRS §12, human input).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION geo.nearby_landmarks(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_radius_m DOUBLE PRECISION DEFAULT 500,
    p_limit INTEGER DEFAULT 8
) RETURNS TABLE (
    osm_id BIGINT,
    name TEXT,
    category TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    distance_m DOUBLE PRECISION
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    WITH origin AS (
        SELECT ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography AS g
    )
    SELECT
        p.osm_id,
        p.name,
        p.category,
        ST_Y(p.geom::geometry),
        ST_X(p.geom::geometry),
        ST_Distance(p.geom, o.g)
    FROM osm.poi p
    CROSS JOIN origin o
    WHERE p.name IS NOT NULL
      AND ST_DWithin(p.geom, o.g, p_radius_m)
    -- `<->` earns its keep HERE, unlike in nearby_workers: this orders directly
    -- against the indexed base table with no window function, so the planner
    -- can walk the GIST index in distance order and stop at LIMIT — which
    -- matters, because a city centre holds thousands of POIs and we want eight.
    ORDER BY p.geom <-> o.g
    LIMIT GREATEST(p_limit, 0);
$$;

COMMENT ON FUNCTION geo.nearby_landmarks IS 'Named OSM points of interest near a coordinate, nearest first (SRS §12).';
