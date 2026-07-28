-- Typo-tolerant admin account search (ADM-02).
--
-- The directory is searched by an admin working from a phone call: they have
-- HEARD a name, not read it, so "Ngono" arrives as "Ngonno" and a LIKE returns
-- nothing — which reads as "no such account" rather than "close, try again".
-- The query uses the same pg_trgm machinery worker search already relies on;
-- this is the index that keeps it off a sequential scan as the directory grows.
--
-- Built on search.immutable_unaccent (not raw "name") so it matches the
-- expression the query actually uses; an index on the bare column would be
-- ignored. REINDEX if the unaccent dictionary ever changes.
CREATE INDEX IF NOT EXISTS "User_name_trgm_idx"
    ON public."User" USING GIN (search.immutable_unaccent("name") gin_trgm_ops);
