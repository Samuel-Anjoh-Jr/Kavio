-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPTS 44-45 — Worker search: fuzzy, taxonomy-scoped, filtered (DIS-04…DIS-08)
--
-- A FOURTH Postgres schema, `search`, for the same reason `osm` and `geo` exist
-- (PROMPT 38): Prisma cannot describe a view, a GIN index or a trigram operator
-- class, so anything of the sort left in `public` reads as drift and the next
-- `migrate dev` offers to drop it.
--
-- Why not put these in `geo`: `geo` is the reviewed SPATIAL surface — its
-- contract is that everything in it is authoritative about distance and
-- containment. Search is spatial AND textual AND trust-ranked, and folding it in
-- would blur what `geo` promises. Search DEPENDS on `geo`; it does not extend it.
--
-- ── The shape of a search ───────────────────────────────────────────────────
-- Matching happens on SERVICES (DIS-05: scoped to the admin taxonomy), and the
-- result is WORKERS. Those are different grains, so the query matches services,
-- collapses to the best-matching service per worker, and then applies every
-- worker-level filter and the ranking.
--
-- Getting that order wrong is the classic bug in this feature: filtering price
-- at the worker level rather than on the service that matched means "plumbing
-- under 5,000 XAF" happily returns a plumber whose cheap listing is haircuts.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE SCHEMA IF NOT EXISTS search;

COMMENT ON SCHEMA search IS 'Reviewed discovery views and functions (DIS-04…DIS-08). Depends on geo; does not extend it.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Accent-insensitive matching.
--
-- Half this catalogue is French, and nobody types "Électricité" with the accent
-- on a phone keyboard. `unaccent()` fixes that, but it is declared STABLE rather
-- than IMMUTABLE — it reads a dictionary file — so Postgres refuses to build an
-- index on it. Wrapping it is the standard remedy.
--
-- The wrapper's honesty condition: it is only truly immutable while the
-- `unaccent` dictionary is unchanged. Editing that dictionary means REINDEXing
-- everything below. We never edit it, and this comment is the reminder of what
-- it would cost.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search.immutable_unaccent(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
    SELECT public.unaccent('public.unaccent'::regdictionary, p_text);
$$;

COMMENT ON FUNCTION search.immutable_unaccent IS 'IMMUTABLE unaccent wrapper so trigram indexes can be built on it. REINDEX if the unaccent dictionary ever changes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigram indexes — what makes a typo cheap.
--
-- GIN rather than GiST: these columns are read constantly and written rarely,
-- which is exactly GIN's trade (slower to update, much faster to search).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Service_name_trgm_idx"
    ON public."Service" USING GIN (search.immutable_unaccent("name") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "ServiceCategory_nameEn_trgm_idx"
    ON public."ServiceCategory" USING GIN (search.immutable_unaccent("nameEn") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "ServiceCategory_nameFr_trgm_idx"
    ON public."ServiceCategory" USING GIN (search.immutable_unaccent("nameFr") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "WorkerProfile_headline_trgm_idx"
    ON public."WorkerProfile" USING GIN (search.immutable_unaccent("headline") gin_trgm_ops);

-- The price-range filter and the derived-range query both scan active services
-- by price; without this they scan every service in the country to find a
-- minimum.
CREATE INDEX IF NOT EXISTS "Service_startingPrice_idx"
    ON public."Service" ("startingPrice") WHERE "isActive";

-- ─────────────────────────────────────────────────────────────────────────────
-- Who is eligible to be found.
--
-- Deliberately NOT `geo.worker_location`, and the difference is the whole point:
-- that view requires a position, because nothing in it means anything without
-- one. Search must still find a worker who has not set their location yet —
-- otherwise a brand-new worker is invisible to a text query, which is precisely
-- the cold-start failure the marketplace cannot afford.
--
-- The eligibility RULES are identical (active account, not trust-suspended) and
-- must stay that way: if a suspended worker could be found here but not there,
-- the suspension would be a UI detail rather than a fact.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW search.searchable_worker AS
SELECT
    w."id"           AS worker_profile_id,
    w."userId"       AS user_id,
    u."name",
    u."avatar",
    w."headline",
    w."city",
    w."area",
    w."landmark",
    w."geoRegionId"  AS geo_region_id,
    u."tier",
    COALESCE(ts."total", 0)         AS trust_score,
    COALESCE(ts."completedJobs", 0) AS completed_jobs,
    ts."averageRating"              AS average_rating,
    ST_Y(w."location"::geometry) AS latitude,
    ST_X(w."location"::geometry) AS longitude,
    w."location"
FROM public."WorkerProfile" w
JOIN public."User" u ON u."id" = w."userId"
LEFT JOIN public."TrustScore" ts ON ts."subjectId" = w."userId"
WHERE u."status" = 'ACTIVE'
  AND COALESCE(ts."suspended", false) = false;

COMMENT ON VIEW search.searchable_worker IS 'Workers eligible for discovery. Unlike geo.worker_location, a missing position is allowed (DIS-04).';

-- ─────────────────────────────────────────────────────────────────────────────
-- The search.
--
-- ── Ranking ─────────────────────────────────────────────────────────────────
-- Three normalised signals in [0,1], blended by weights the API passes in so the
-- weighting is ONE reviewed decision in TypeScript (search-ranking.ts) rather
-- than a number buried in a migration nobody re-reads:
--
--   relevance  trigram similarity of the query to the service/category name.
--              1.0 when there is no query — a browse must not be ranked by an
--              accident of empty-string similarity.
--   proximity  linear falloff across the radius. 1.0 at the origin, 0 at the
--              edge, and 1.0 (neutral) when the searcher gave no location.
--   trust      tier-first, score-second, matching trust-ranking.ts (DIS-08,
--              TRU-04). A tier is a passed verification gate; the score also
--              moves on softer signals, so tier dominates.
--
-- Trust is a RANKING input, never a filter, unless the caller explicitly asked
-- for a minimum. Priority placement for verified workers is the requirement
-- (DIS-08); quietly hiding everyone else is not, and on a marketplace this young
-- it would empty the results page.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search.workers(
    p_query                TEXT DEFAULT NULL,
    p_lat                  DOUBLE PRECISION DEFAULT NULL,
    p_lng                  DOUBLE PRECISION DEFAULT NULL,
    p_radius_m             DOUBLE PRECISION DEFAULT NULL,
    p_category_id          UUID DEFAULT NULL,
    p_min_price            INTEGER DEFAULT NULL,
    p_max_price            INTEGER DEFAULT NULL,
    p_min_trust_score      INTEGER DEFAULT NULL,
    p_min_tier             "VerificationTier" DEFAULT NULL,
    p_min_rating           NUMERIC DEFAULT NULL,
    p_verified_only        BOOLEAN DEFAULT FALSE,
    -- What "verified" means is a PRODUCT decision, so it arrives as a parameter
    -- from search.config.ts rather than being written into this file twice.
    p_verified_min_tier    "VerificationTier" DEFAULT 'TIER_2',
    p_available_day        INTEGER DEFAULT NULL,
    p_available_time       TEXT DEFAULT NULL,
    p_available_date       DATE DEFAULT NULL,
    p_weight_relevance     REAL DEFAULT 0.45,
    p_weight_proximity     REAL DEFAULT 0.30,
    p_weight_trust         REAL DEFAULT 0.25,
    p_sort                 TEXT DEFAULT 'relevance',
    p_limit                INTEGER DEFAULT 20,
    p_offset               INTEGER DEFAULT 0
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
    distance_m DOUBLE PRECISION,
    matched_service_id UUID,
    matched_service_name TEXT,
    matched_category_id UUID,
    matched_category_slug TEXT,
    price_from INTEGER,
    matched_service_count INTEGER,
    relevance REAL,
    proximity REAL,
    trust_rank REAL,
    rank_score REAL,
    total_count BIGINT
)
LANGUAGE sql
STABLE
PARALLEL SAFE
-- Looser than the 0.3 default. Cameroonian trade names are routinely typed
-- phonetically ("plombri", "menuisié") and 0.3 drops those on the floor.
SET pg_trgm.similarity_threshold = 0.2
AS $$
    WITH params AS (
        SELECT
            NULLIF(BTRIM(COALESCE(p_query, '')), '') AS raw_query,
            CASE
                WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL
                THEN ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
            END AS origin
    ),
    q AS (
        SELECT
            search.immutable_unaccent(raw_query) AS text,
            origin
        FROM params
    ),
    -- ── Match on services, scoped to the taxonomy (DIS-05) ──────────────────
    -- LEFT JOIN to ServiceCategory on purpose: a service an admin has not
    -- categorised yet is still findable BY NAME, but never by category browse.
    -- That is the incentive the catalog schema chose — an uncategorised listing
    -- costs the worker visibility without costing them the listing.
    matched_service AS (
        SELECT
            s."workerProfileId" AS worker_profile_id,
            s."id"              AS service_id,
            s."name"            AS service_name,
            s."startingPrice"   AS starting_price,
            s."categoryId"      AS category_id,
            c."slug"            AS category_slug,
            CASE
                WHEN q.text IS NULL THEN 1.0::real
                ELSE GREATEST(
                    similarity(search.immutable_unaccent(s."name"), q.text),
                    similarity(search.immutable_unaccent(COALESCE(c."nameEn", '')), q.text),
                    similarity(search.immutable_unaccent(COALESCE(c."nameFr", '')), q.text)
                )
            END AS relevance
        FROM public."Service" s
        LEFT JOIN public."ServiceCategory" c ON c."id" = s."categoryId"
        CROSS JOIN q
        WHERE s."isActive"
          -- A retired category stops scoping new discovery immediately, while
          -- the row itself survives so historic jobs still resolve (ADM-02).
          AND (c."id" IS NULL OR c."isActive")
          -- Category filter spans one level of children: picking "Electrical"
          -- must not exclude "Electrical → Solar installation".
          AND (
              p_category_id IS NULL
              OR s."categoryId" = p_category_id
              OR c."parentId" = p_category_id
          )
          -- Price is filtered on the service that MATCHED, never on the worker.
          AND (p_min_price IS NULL OR s."startingPrice" >= p_min_price)
          AND (p_max_price IS NULL OR s."startingPrice" <= p_max_price)
          AND (
              q.text IS NULL
              -- `%` and ILIKE both ride the GIN trigram indexes above. Written
              -- as `similarity(...) >= 0.2` instead, this would be logically
              -- identical and would silently become a full scan of every
              -- service in the country on every keystroke.
              OR search.immutable_unaccent(s."name") % q.text
              OR search.immutable_unaccent(s."name") ILIKE '%' || q.text || '%'
              OR search.immutable_unaccent(COALESCE(c."nameEn", '')) % q.text
              OR search.immutable_unaccent(COALESCE(c."nameFr", '')) % q.text
              OR search.immutable_unaccent(COALESCE(c."nameEn", '')) ILIKE q.text || '%'
              OR search.immutable_unaccent(COALESCE(c."nameFr", '')) ILIKE q.text || '%'
          )
    ),
    -- Collapse to one row per worker: their best-matching service is what the
    -- result card shows, and `price_from` is the cheapest MATCHING service, not
    -- the cheapest thing they do.
    best_service AS (
        SELECT DISTINCT ON (m.worker_profile_id)
            m.worker_profile_id,
            m.service_id,
            m.service_name,
            m.starting_price,
            m.category_id,
            m.category_slug,
            m.relevance
        FROM matched_service m
        ORDER BY m.worker_profile_id, m.relevance DESC, m.starting_price ASC NULLS LAST
    ),
    service_totals AS (
        SELECT
            m.worker_profile_id,
            MIN(m.starting_price)::integer AS price_from,
            COUNT(*)::integer              AS matched_service_count
        FROM matched_service m
        GROUP BY m.worker_profile_id
    ),
    -- ── Worker-level filters and scoring ────────────────────────────────────
    candidate AS (
        SELECT
            w.*,
            b.service_id,
            b.service_name,
            b.category_id      AS matched_category_id,
            b.category_slug,
            t.price_from,
            t.matched_service_count,
            -- The headline is a BONUS, never its own match path: letting a
            -- headline match on its own would return workers who describe
            -- themselves as plumbers but list no plumbing service, which is
            -- exactly the unscoped free-text result DIS-05 rules out.
            LEAST(
                1.0,
                b.relevance + CASE
                    WHEN q.text IS NULL OR w."headline" IS NULL THEN 0
                    ELSE similarity(search.immutable_unaccent(w."headline"), q.text) * 0.15
                END
            )::real AS relevance,
            CASE WHEN q.origin IS NULL THEN NULL ELSE ST_Distance(w."location", q.origin) END AS distance_m
        FROM search.searchable_worker w
        JOIN best_service b   ON b.worker_profile_id = w.worker_profile_id
        JOIN service_totals t ON t.worker_profile_id = w.worker_profile_id
        CROSS JOIN q
        WHERE (p_min_trust_score IS NULL OR w.trust_score >= p_min_trust_score)
          AND (p_min_tier IS NULL OR w."tier" >= p_min_tier)
          -- An unrated worker is EXCLUDED by a rating filter rather than
          -- treated as zero. "At least 4 stars" is a claim about evidence, and
          -- nobody with no reviews satisfies it — but see search.filter_ranges,
          -- which reports how many workers are rated at all so the UI can hide
          -- this control while the answer is none.
          AND (p_min_rating IS NULL OR w.average_rating >= p_min_rating)
          -- Tier 1 is only a confirmed phone number; calling that "verified" on
          -- a trust-first marketplace would be the single most damaging
          -- overclaim we could make. The threshold itself is argued in
          -- search.config.ts, which supplies it.
          AND (NOT p_verified_only OR w."tier" >= p_verified_min_tier)
          AND (
              q.origin IS NULL
              OR (
                  w."location" IS NOT NULL
                  -- ST_DWithin is the index-using predicate; comparing
                  -- ST_Distance to the radius disables the GIST index.
                  AND ST_DWithin(w."location", q.origin, COALESCE(p_radius_m, 10000))
              )
          )
          AND (
              p_available_day IS NULL
              OR EXISTS (
                  SELECT 1 FROM public."Availability" a
                  WHERE a."workerProfileId" = w.worker_profile_id
                    AND a."dayOfWeek" = p_available_day
                    AND (
                        p_available_time IS NULL
                        -- 'HH:MM' strings compare correctly as text, which is
                        -- why the weekly rule is stored as text and not as a
                        -- timestamp bound to some arbitrary date.
                        OR (a."startTime" <= p_available_time AND a."endTime" > p_available_time)
                    )
              )
          )
          AND (
              p_available_date IS NULL
              OR NOT EXISTS (
                  SELECT 1 FROM public."AvailabilityException" e
                  WHERE e."workerProfileId" = w.worker_profile_id
                    AND e."date" = p_available_date
                    AND e."isAvailable" = false
              )
          )
    ),
    scored AS (
        SELECT
            c.*,
            CASE
                WHEN c.distance_m IS NULL THEN 1.0::real
                ELSE GREATEST(
                    0.0,
                    1.0 - (c.distance_m / NULLIF(COALESCE(p_radius_m, 10000), 0))
                )::real
            END AS proximity,
            (
                -- Tier contributes 0.6 of the trust signal and the score 0.4, so
                -- a tier boundary always outweighs a score difference within a
                -- tier. Same ordering as TRUST_RANKING_ORDER_BY, expressed as a
                -- number because this has to blend with two other signals.
                (array_position(enum_range(NULL::"VerificationTier"), c."tier") - 1)::real / 3.0 * 0.6
                + LEAST(c.trust_score, 100)::real / 100.0 * 0.4
            )::real AS trust_rank
        FROM candidate c
    )
    SELECT
        s.worker_profile_id,
        s.user_id,
        s."name",
        s."avatar",
        s."headline",
        s."city",
        s."area",
        s."landmark",
        s."tier",
        s.trust_score,
        s.completed_jobs,
        s.average_rating,
        s.latitude,
        s.longitude,
        s.distance_m,
        s.service_id,
        s.service_name,
        s.matched_category_id,
        s.category_slug,
        s.price_from,
        s.matched_service_count,
        s.relevance,
        s.proximity,
        s.trust_rank,
        (
            p_weight_relevance * s.relevance
            + p_weight_proximity * s.proximity
            + p_weight_trust * s.trust_rank
        )::real AS rank_score,
        -- Rides along as a window function so the caller learns the true size of
        -- the result set in the same round-trip as the page. That number is what
        -- the no-provider message (DIS-06) is decided on, and it is a different
        -- statement from "this page is empty".
        COUNT(*) OVER () AS total_count
    FROM scored s
    ORDER BY
        -- worker_profile_id is the final tie-break in every mode, so paging is
        -- STABLE: without it two equally-ranked workers can swap places between
        -- page one and page two and the client shows one of them twice.
        CASE WHEN p_sort = 'distance' THEN s.distance_m END ASC NULLS LAST,
        CASE WHEN p_sort = 'price'    THEN s.price_from END ASC NULLS LAST,
        CASE WHEN p_sort = 'trust'    THEN s.trust_rank END DESC NULLS LAST,
        CASE WHEN p_sort NOT IN ('distance', 'price', 'trust')
             THEN p_weight_relevance * s.relevance
                + p_weight_proximity * s.proximity
                + p_weight_trust * s.trust_rank
        END DESC NULLS LAST,
        s.worker_profile_id
    LIMIT GREATEST(p_limit, 0)
    OFFSET GREATEST(p_offset, 0);
$$;

COMMENT ON FUNCTION search.workers IS 'Fuzzy, taxonomy-scoped, filtered worker search ranked on relevance + proximity + trust (DIS-04…DIS-08).';

-- ─────────────────────────────────────────────────────────────────────────────
-- The no-provider probe (DIS-06).
--
-- "No results" has at least four very different causes, and telling a user the
-- wrong one is worse than telling them nothing:
--
--   nobody offers this anywhere      → "we don't cover this trade yet"
--   nobody offers this NEAR YOU      → "no providers in your area yet" + how far
--   your filters excluded everyone   → "try relaxing your filters"
--   we didn't understand the words   → "did you mean…?"
--
-- Only the database can distinguish them, and only in one round trip is it
-- affordable, so it happens here rather than as three follow-up queries from the
-- API. This runs ONLY when the main search returned nothing.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search.provider_probe(
    p_query       TEXT DEFAULT NULL,
    p_lat         DOUBLE PRECISION DEFAULT NULL,
    p_lng         DOUBLE PRECISION DEFAULT NULL,
    p_radius_m    DOUBLE PRECISION DEFAULT NULL,
    p_category_id UUID DEFAULT NULL
) RETURNS TABLE (
    -- Workers matching the query/category ANYWHERE, ignoring area and filters.
    matches_anywhere BIGINT,
    -- …of those, how many are inside the requested radius.
    matches_in_area BIGINT,
    -- Distance to the closest match outside the radius, so the UI can offer a
    -- concrete "widen to 15 km" instead of a vague "try a bigger area".
    nearest_match_m DOUBLE PRECISION
)
LANGUAGE sql
STABLE
PARALLEL SAFE
SET pg_trgm.similarity_threshold = 0.2
AS $$
    WITH q AS (
        SELECT
            search.immutable_unaccent(NULLIF(BTRIM(COALESCE(p_query, '')), '')) AS text,
            CASE
                WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL
                THEN ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
            END AS origin
    ),
    matched AS (
        SELECT DISTINCT
            w.worker_profile_id,
            CASE
                WHEN q.origin IS NULL OR w."location" IS NULL THEN NULL
                ELSE ST_Distance(w."location", q.origin)
            END AS distance_m
        FROM search.searchable_worker w
        JOIN public."Service" s ON s."workerProfileId" = w.worker_profile_id AND s."isActive"
        LEFT JOIN public."ServiceCategory" c ON c."id" = s."categoryId"
        CROSS JOIN q
        WHERE (c."id" IS NULL OR c."isActive")
          AND (
              p_category_id IS NULL
              OR s."categoryId" = p_category_id
              OR c."parentId" = p_category_id
          )
          AND (
              q.text IS NULL
              OR search.immutable_unaccent(s."name") % q.text
              OR search.immutable_unaccent(s."name") ILIKE '%' || q.text || '%'
              OR search.immutable_unaccent(COALESCE(c."nameEn", '')) % q.text
              OR search.immutable_unaccent(COALESCE(c."nameFr", '')) % q.text
          )
    )
    SELECT
        COUNT(*)::bigint,
        COUNT(*) FILTER (
            WHERE m.distance_m IS NOT NULL
              AND m.distance_m <= COALESCE(p_radius_m, 10000)
        )::bigint,
        MIN(m.distance_m) FILTER (WHERE m.distance_m > COALESCE(p_radius_m, 10000))
    FROM matched m;
$$;

COMMENT ON FUNCTION search.provider_probe IS 'Why a search came back empty, and how far the nearest match is (DIS-06).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Filter ranges, DERIVED from the data (DIS-07).
--
-- The requirement is explicit that ranges are never hardcoded, and the reason is
-- practical rather than aesthetic: a price slider whose maximum is a developer's
-- guess is either unusable (everything bunched at the left) or quietly excludes
-- the expensive half of the market. These bounds come from the listings that
-- actually exist, inside the area actually being browsed.
--
-- Percentiles ride along because min/max alone make a terrible slider — one
-- 2,000,000 XAF listing would flatten every other value into the first pixel.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search.filter_ranges(
    p_lat               DOUBLE PRECISION DEFAULT NULL,
    p_lng               DOUBLE PRECISION DEFAULT NULL,
    p_radius_m          DOUBLE PRECISION DEFAULT NULL,
    p_category_id       UUID DEFAULT NULL,
    -- Same source as search.workers, so the count of "verified workers here"
    -- can never mean something different from the verified-only filter.
    p_verified_min_tier "VerificationTier" DEFAULT 'TIER_2'
) RETURNS TABLE (
    price_min INTEGER,
    price_max INTEGER,
    price_p25 INTEGER,
    price_p75 INTEGER,
    priced_service_count BIGINT,
    trust_score_min INTEGER,
    trust_score_max INTEGER,
    rating_min NUMERIC,
    rating_max NUMERIC,
    rated_worker_count BIGINT,
    verified_worker_count BIGINT,
    worker_count BIGINT,
    farthest_match_m DOUBLE PRECISION
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    WITH q AS (
        SELECT CASE
            WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL
            THEN ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
        END AS origin
    ),
    scope AS (
        SELECT
            w.worker_profile_id,
            w."tier",
            w.trust_score,
            w.average_rating,
            CASE
                WHEN q.origin IS NULL OR w."location" IS NULL THEN NULL
                ELSE ST_Distance(w."location", q.origin)
            END AS distance_m
        FROM search.searchable_worker w
        CROSS JOIN q
        WHERE (
              q.origin IS NULL
              OR (w."location" IS NOT NULL
                  AND ST_DWithin(w."location", q.origin, COALESCE(p_radius_m, 10000)))
          )
          AND (
              p_category_id IS NULL
              OR EXISTS (
                  SELECT 1
                  FROM public."Service" s
                  LEFT JOIN public."ServiceCategory" c ON c."id" = s."categoryId"
                  WHERE s."workerProfileId" = w.worker_profile_id
                    AND s."isActive"
                    AND (s."categoryId" = p_category_id OR c."parentId" = p_category_id)
              )
          )
    ),
    prices AS (
        SELECT s."startingPrice" AS price
        FROM public."Service" s
        LEFT JOIN public."ServiceCategory" c ON c."id" = s."categoryId"
        JOIN scope sc ON sc.worker_profile_id = s."workerProfileId"
        WHERE s."isActive"
          AND s."startingPrice" IS NOT NULL
          AND (c."id" IS NULL OR c."isActive")
          AND (
              p_category_id IS NULL
              OR s."categoryId" = p_category_id
              OR c."parentId" = p_category_id
          )
    )
    SELECT
        (SELECT MIN(price)::integer FROM prices),
        (SELECT MAX(price)::integer FROM prices),
        (SELECT percentile_cont(0.25) WITHIN GROUP (ORDER BY price)::integer FROM prices),
        (SELECT percentile_cont(0.75) WITHIN GROUP (ORDER BY price)::integer FROM prices),
        (SELECT COUNT(*)::bigint FROM prices),
        MIN(sc.trust_score)::integer,
        MAX(sc.trust_score)::integer,
        MIN(sc.average_rating),
        MAX(sc.average_rating),
        COUNT(*) FILTER (WHERE sc.average_rating IS NOT NULL)::bigint,
        COUNT(*) FILTER (WHERE sc."tier" >= p_verified_min_tier)::bigint,
        COUNT(*)::bigint,
        MAX(sc.distance_m)
    FROM scope sc;
$$;

COMMENT ON FUNCTION search.filter_ranges IS 'Filter bounds derived from live listings in the browsed area (DIS-07). Never hardcode these.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Category facets: how many workers per category are actually reachable here.
--
-- Feeds both the filter chips and the "trending categories" surface (DIS-03).
-- A category with a zero count in this area is still RETURNED, with zero — the
-- honest answer to "can I get a welder in Bonabéri?" is "not yet", and silently
-- omitting the chip makes the app look like it has never heard of welding.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search.category_facets(
    p_lat      DOUBLE PRECISION DEFAULT NULL,
    p_lng      DOUBLE PRECISION DEFAULT NULL,
    p_radius_m DOUBLE PRECISION DEFAULT NULL
) RETURNS TABLE (
    category_id UUID,
    slug TEXT,
    name_en TEXT,
    name_fr TEXT,
    icon TEXT,
    parent_id UUID,
    sort_order INTEGER,
    worker_count BIGINT
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    WITH q AS (
        SELECT CASE
            WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL
            THEN ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
        END AS origin
    ),
    scope AS (
        SELECT w.worker_profile_id
        FROM search.searchable_worker w
        CROSS JOIN q
        WHERE q.origin IS NULL
           OR (w."location" IS NOT NULL
               AND ST_DWithin(w."location", q.origin, COALESCE(p_radius_m, 10000)))
    )
    SELECT
        c."id",
        c."slug",
        c."nameEn",
        c."nameFr",
        c."icon",
        c."parentId",
        c."sortOrder",
        COUNT(DISTINCT s."workerProfileId")::bigint
    FROM public."ServiceCategory" c
    LEFT JOIN public."Service" s
        ON s."categoryId" = c."id"
       AND s."isActive"
       AND s."workerProfileId" IN (SELECT worker_profile_id FROM scope)
    WHERE c."isActive"
    GROUP BY c."id", c."slug", c."nameEn", c."nameFr", c."icon", c."parentId", c."sortOrder"
    ORDER BY c."sortOrder", c."nameEn";
$$;

COMMENT ON FUNCTION search.category_facets IS 'Worker counts per taxonomy category in an area, zeros included (DIS-03, DIS-07).';
