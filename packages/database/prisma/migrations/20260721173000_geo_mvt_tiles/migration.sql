-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPT 41 — Dynamic MVT tiles from PostGIS (SRS §12)
--
-- CARTO's role is to run spatial SQL over this database and emit tiles; Mapbox
-- GL JS consumes them and paints. Both read the SAME functions defined here, so
-- a tile served through CARTO and a tile served directly by the API are the same
-- bytes computed from the same live data — CARTO is a delivery path, never a
-- second copy of the truth.
--
-- ── A safety decision, stated once ──────────────────────────────────────────
-- The worker layer is DENSITY ONLY. It emits grid cells with counts, never a
-- worker's identity and never their exact position.
--
-- Map tiles are public and cacheable by anyone who can guess a z/x/y. A tile
-- carrying precise worker coordinates would publish the home addresses of
-- self-employed people — many of them women working alone — to the open
-- internet, permanently and in bulk. Individual positions reach a client only
-- through `geo.nearby_workers` (PROMPT 40), which is a request the API can
-- authorise, rate-limit and log. There is no zoom level at which this layer
-- stops aggregating.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- Worker density.
--
-- Positions are snapped to a grid whose cell size is derived from the tile's own
-- extent, so a cell is a constant number of SCREEN pixels at every zoom: the
-- heat map keeps the same visual grain whether you are looking at all of Douala
-- or at one quarter, and the client never has to re-bin anything.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION geo.mvt_worker_density(
    p_z INTEGER,
    p_x INTEGER,
    p_y INTEGER
) RETURNS BYTEA
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
AS $$
DECLARE
    v_bounds geometry;
    v_cell DOUBLE PRECISION;
    v_tile BYTEA;
BEGIN
    -- ST_TileEnvelope returns the tile's extent in Web Mercator (3857), which is
    -- the projection MVT is defined in.
    v_bounds := ST_TileEnvelope(p_z, p_x, p_y);

    -- 32 cells across a 256-unit tile ⇒ one cell ≈ 8 screen pixels.
    v_cell := (ST_XMax(v_bounds) - ST_XMin(v_bounds)) / 32.0;

    WITH candidates AS (
        SELECT
            w.trust_score,
            w.tier,
            ST_SnapToGrid(
                ST_Transform(w."location"::geometry, 3857),
                v_cell
            ) AS cell_geom
        FROM geo.worker_location w
        -- Filter in 4326 against the geography column so the GIST index on
        -- WorkerProfile."location" is usable; transforming the column instead
        -- would force a sequential scan of every worker for every tile.
        WHERE ST_Intersects(
            w."location",
            ST_Transform(ST_Expand(v_bounds, v_cell), 4326)::geography
        )
    ),
    binned AS (
        SELECT
            cell_geom,
            COUNT(*)::INTEGER AS worker_count,
            ROUND(AVG(trust_score))::INTEGER AS avg_trust_score,
            -- Enough to colour a cell by "is there anyone verified here?"
            -- without naming who.
            COUNT(*) FILTER (WHERE tier <> 'TIER_0')::INTEGER AS verified_count
        FROM candidates
        GROUP BY cell_geom
    ),
    mvt AS (
        SELECT
            ST_AsMVTGeom(b.cell_geom, v_bounds, 4096, 64, true) AS geom,
            b.worker_count,
            b.avg_trust_score,
            b.verified_count
        FROM binned b
        WHERE b.cell_geom IS NOT NULL
    )
    SELECT ST_AsMVT(mvt.*, 'worker_density', 4096, 'geom')
    INTO v_tile
    FROM mvt
    WHERE mvt.geom IS NOT NULL;

    -- An empty tile is a valid, cacheable answer meaning "nobody here", not an
    -- error. Returning NULL would make the HTTP layer guess.
    RETURN COALESCE(v_tile, ''::BYTEA);
END;
$$;

COMMENT ON FUNCTION geo.mvt_worker_density IS 'Aggregated worker-density MVT layer. Never emits an individual worker or position (PROMPT 41).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Region boundaries.
--
-- Simplification tolerance scales with the tile, because sending a quarter's
-- full polygon at city zoom spends bandwidth on detail smaller than one pixel —
-- and bandwidth is the scarce resource for the phones this is built for.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION geo.mvt_regions(
    p_z INTEGER,
    p_x INTEGER,
    p_y INTEGER
) RETURNS BYTEA
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
AS $$
DECLARE
    v_bounds geometry;
    v_tolerance DOUBLE PRECISION;
    v_tile BYTEA;
BEGIN
    v_bounds := ST_TileEnvelope(p_z, p_x, p_y);
    -- ~1 screen pixel at this zoom.
    v_tolerance := (ST_XMax(v_bounds) - ST_XMin(v_bounds)) / 256.0;

    WITH mvt AS (
        SELECT
            ST_AsMVTGeom(
                ST_SimplifyPreserveTopology(
                    ST_Transform(r."boundary"::geometry, 3857),
                    v_tolerance
                ),
                v_bounds, 4096, 64, true
            ) AS geom,
            r."id"::TEXT AS region_id,
            r."slug" AS slug,
            r."nameEn" AS name_en,
            r."nameFr" AS name_fr,
            r."level"::TEXT AS level
        FROM public."GeoRegion" r
        WHERE r."isActive"
          AND r."boundary" IS NOT NULL
          AND ST_Intersects(r."boundary", ST_Transform(v_bounds, 4326)::geography)
    )
    SELECT ST_AsMVT(mvt.*, 'regions', 4096, 'geom')
    INTO v_tile
    FROM mvt
    WHERE mvt.geom IS NOT NULL;

    RETURN COALESCE(v_tile, ''::BYTEA);
END;
$$;

COMMENT ON FUNCTION geo.mvt_regions IS 'Region boundary MVT layer, simplified per zoom (PROMPT 41).';
