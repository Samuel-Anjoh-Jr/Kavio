-- Worker discovery gate + fair per-viewer ranking.
--
-- Two changes, in one migration because both rewrite the same search objects.
--
-- 1. DISCOVERY GATE. A worker profile is only public once the identity has
--    verified a contact channel (phone OR email — SMS is a paid aggregator that
--    is not live, so email carries this today) AND has had an ID approved.
--    Clients need none of this: they browse, hire, pay escrow and review with
--    no KYC at all. The asymmetry is the product — you are trusting the person
--    who comes to your house, not the person who opens the door.
--
--    The gate lives in the VIEW rather than behind a function parameter so that
--    every reader inherits it: search, the explore feed, the density tiles and
--    the no-provider probe all sit on this view and none of them can forget.
--
-- 2. FAIR RANKING. Ranking was a total order on a continuous score, so the same
--    handful of workers occupied the top of every result set for every visitor,
--    forever — and nobody below them could ever earn the jobs that would raise
--    their score. Scores are now floored into bands; a band still outranks the
--    band below it, but inside a band the order is a hash of (worker, viewer).
--    The same visitor refreshing sees a stable order; two visitors see
--    different workers on top.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The discovery gate, on the view every reader shares.
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
  AND COALESCE(ts."suspended", false) = false
  -- A reachable contact. Either channel satisfies it: which one an operator
  -- REQUIRES at signup is a separate, admin-tunable decision
  -- (verification.contactChannel); being reachable at all is not optional.
  AND (u."phoneVerifiedAt" IS NOT NULL OR u."emailVerifiedAt" IS NOT NULL)
  -- An approved government ID. `status` is the settled outcome of the latest
  -- attempt, so a rejected-then-reapproved worker is correctly visible and a
  -- merely SUBMITTED one is correctly not.
  AND EXISTS (
      SELECT 1
      FROM public."VerificationRecord" vr
      WHERE vr."subjectId" = u."id"
        AND vr."checkType" = 'ID_APPROVED'
        AND vr."status" = 'VERIFIED'
  );

COMMENT ON VIEW search.searchable_worker IS 'Workers eligible for discovery: active, unsuspended, contact-verified (phone or email) and ID-approved. A missing position is allowed (DIS-04).';

-- Supports the EXISTS above, which now runs for every discovery read.
CREATE INDEX IF NOT EXISTS "VerificationRecord_subject_check_status_idx"
    ON public."VerificationRecord" ("subjectId", "checkType", "status");

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fair ranking. The signature gains two parameters, both defaulted, so any
--    caller that has not been updated keeps the previous behaviour.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS search.workers(
    TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, UUID, INTEGER,
    INTEGER, INTEGER, "VerificationTier", NUMERIC, BOOLEAN, "VerificationTier",
    INTEGER, TEXT, DATE, REAL, REAL, REAL, TEXT, INTEGER, INTEGER
);

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
    p_offset               INTEGER DEFAULT 0,
    -- Stable per-viewer key (device/session id). Equally-ranked workers are
    -- shuffled by hash of (worker, seed): the same visitor refreshing sees the
    -- same order, while a different visitor sees a different face on top.
    p_viewer_seed          TEXT DEFAULT '',
    -- Width of a "same relevance" band. Composite scores are floored to a
    -- multiple of this before the shuffle, so the shuffle can only ever reorder
    -- genuine near-ties and never promotes a weaker worker over a stronger one.
    p_fairness_band        REAL DEFAULT 0.05
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
    rank_band REAL,
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
        -- The tie bucket this worker falls in. Floor, not round, so a band is a
        -- half-open interval and a score exactly on a boundary belongs to
        -- exactly one bucket.
        (FLOOR(
            (
                p_weight_relevance * s.relevance
                + p_weight_proximity * s.proximity
                + p_weight_trust * s.trust_rank
            ) / GREATEST(p_fairness_band, 0.0001)
        ) * GREATEST(p_fairness_band, 0.0001))::real AS rank_band,
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
        -- Relevance mode ranks by BAND, not by raw score, so everyone inside a
        -- band is treated as equally good...
        CASE WHEN p_sort NOT IN ('distance', 'price', 'trust')
             THEN FLOOR(
                    (
                        p_weight_relevance * s.relevance
                        + p_weight_proximity * s.proximity
                        + p_weight_trust * s.trust_rank
                    ) / GREATEST(p_fairness_band, 0.0001)
                  )
        END DESC NULLS LAST,
        -- ...and inside the band the order is a deterministic function of the
        -- viewer. Without this the same top workers win every search forever and
        -- nobody below them accumulates the jobs that would raise their score.
        CASE WHEN p_sort NOT IN ('distance', 'price', 'trust') AND p_viewer_seed <> ''
             THEN hashtext(s.worker_profile_id::text || p_viewer_seed)
        END ASC,
        s.worker_profile_id
    LIMIT GREATEST(p_limit, 0)
    OFFSET GREATEST(p_offset, 0);
$$;


COMMENT ON FUNCTION search.workers IS 'Fuzzy, taxonomy-scoped, filtered worker search. Ranked on relevance + proximity + trust, banded so equally-ranked workers are shuffled deterministically per viewer (DIS-04...DIS-08).';
