/**
 * OSM ingest for the launch cities (PROMPT 38, SRS §12).
 *
 *   pnpm db:osm:ingest              # Douala + Yaoundé
 *   pnpm db:osm:ingest douala       # one city
 *   pnpm db:osm:ingest --all-roads  # every road, not just the named network
 *
 * Fills the `osm` schema — boundaries, roads, POIs — and then UPGRADES the
 * seeded GeoRegion boxes to the real administrative polygons behind them.
 *
 * Why Overpass and not osm2pgsql: osm2pgsql is the right tool for a continental
 * extract, and the wrong dependency to put between a new contributor and a
 * working map. Two cities is a few MB over HTTP, and this runs anywhere Node
 * runs — no PBF download, no native build, no PATH surgery.
 *
 * Safe to re-run. Every write is an upsert keyed on the OSM id, so a re-ingest
 * corrects what changed and leaves the rest; the map is never briefly empty the
 * way a truncate-and-reload would leave it.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const OVERPASS_URL = process.env.OSM_OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';

/**
 * Bounding boxes as Overpass wants them: (south, west, north, east). Generous
 * on purpose — a box that clips Bonabéri off the north-west of Douala produces
 * a map that is subtly wrong in exactly the place people would notice.
 */
const CITIES = {
  douala: { name: 'Douala', bbox: [3.92, 9.58, 4.19, 9.92] },
  yaounde: { name: 'Yaoundé', bbox: [3.74, 11.36, 3.98, 11.64] },
};

/**
 * The named road network. Service roads and driveways triple the row count for
 * detail nobody navigates by, so they are opt-in behind --all-roads.
 */
const ROAD_CLASSES =
  'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street';

/** POI tags worth treating as landmarks. "Behind the Total station" is an address here. */
const POI_TAGS = ['amenity', 'shop', 'office', 'tourism', 'healthcare'];

const BATCH_SIZE = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Overpass
// ─────────────────────────────────────────────────────────────────────────────

async function overpass(query) {
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Overpass is a donated public resource and it rate-limits anonymous
      // floods. Identifying the client is the courtesy that keeps it usable.
      'User-Agent': 'TrustPro/0.1 (ingest; https://trustpro.cm)',
    },
    body: new URLSearchParams({ data: query }).toString(),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Overpass ${response.status} ${response.statusText}. ${detail.slice(0, 400)}\n` +
        'If this is a 429 or 504 the public instance is busy — retry in a minute, ' +
        'or point OSM_OVERPASS_URL at your own instance.',
    );
  }

  const body = await response.json();
  return body.elements ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// WKT
//
// OSM gives coordinates as {lat, lon}; WKT wants "X Y" = "lon lat". Every
// coordinate in this file passes through these two helpers so the order is
// decided once rather than at each call site.
// ─────────────────────────────────────────────────────────────────────────────

function ring(points) {
  return `(${points.map((p) => `${p.lon} ${p.lat}`).join(', ')})`;
}

function pointWkt(element) {
  return `POINT(${element.lon} ${element.lat})`;
}

function lineWkt(element) {
  return `LINESTRING${ring(element.geometry)}`;
}

/**
 * Every way belonging to a boundary, as one MULTILINESTRING.
 *
 * Deliberately NOT assembled into polygons here. Chaining OSM member ways into
 * closed rings and then working out which inner ring belongs inside which outer
 * one is a genuinely hard bit of computational geometry, and PostGIS already
 * does it correctly: ST_BuildArea takes noded lines and returns polygons with
 * their holes in the right places. Handing it lines is both less code and more
 * correct than a hand-rolled assembler.
 */
function boundaryLinesWkt(element) {
  const parts = [];

  if (element.type === 'way' && element.geometry?.length > 1) {
    parts.push(ring(element.geometry));
  }

  for (const member of element.members ?? []) {
    if (member.type === 'way' && member.geometry?.length > 1) {
      parts.push(ring(member.geometry));
    }
  }

  return parts.length > 0 ? `MULTILINESTRING(${parts.join(', ')})` : null;
}

/**
 * OSM numbers nodes, ways and relations in three independent sequences, so id
 * 12345 can be all three at once. Relations are stored negative to keep one
 * primary key honest across the lot — the same convention osm2pgsql uses.
 */
function storedId(element) {
  return element.type === 'relation' ? -element.id : element.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ingest
// ─────────────────────────────────────────────────────────────────────────────

async function ingestBoundaries(city) {
  const [s, w, n, e] = city.bbox;
  const elements = await overpass(`
    [out:json][timeout:180];
    (
      relation["boundary"="administrative"]["admin_level"~"^(4|6|7|8|9|10)$"](${s},${w},${n},${e});
      way["boundary"="administrative"]["admin_level"~"^(4|6|7|8|9|10)$"](${s},${w},${n},${e});
    );
    out geom;
  `);

  let written = 0;
  let skipped = 0;

  for (const element of elements) {
    const wkt = boundaryLinesWkt(element);
    if (!wkt) {
      skipped += 1;
      continue;
    }

    const tags = element.tags ?? {};

    // Built inside a CTE so an unclosed or self-intersecting boundary — which
    // OSM does contain — is skipped by the WHERE rather than failing the NOT
    // NULL constraint and aborting the whole city.
    const rows = await prisma.$executeRawUnsafe(
      `
      WITH built AS (
        SELECT ST_Multi(
          ST_CollectionExtract(
            ST_MakeValid(ST_BuildArea(ST_Node(ST_GeomFromText($7, 4326)))),
            3
          )
        )::geography AS g
      )
      INSERT INTO osm.boundary (osm_id, name, name_en, name_fr, admin_level, tags, geom, ingested_at)
      SELECT $1::bigint, $2, $3, $4, $5::integer, $6::jsonb, built.g, NOW()
      FROM built
      WHERE built.g IS NOT NULL AND NOT ST_IsEmpty(built.g::geometry)
      ON CONFLICT (osm_id) DO UPDATE SET
        name = EXCLUDED.name,
        name_en = EXCLUDED.name_en,
        name_fr = EXCLUDED.name_fr,
        admin_level = EXCLUDED.admin_level,
        tags = EXCLUDED.tags,
        geom = EXCLUDED.geom,
        ingested_at = NOW()
      `,
      storedId(element),
      tags.name ?? null,
      tags['name:en'] ?? null,
      tags['name:fr'] ?? null,
      tags.admin_level ? Number(tags.admin_level) : null,
      JSON.stringify(tags),
      wkt,
    );

    if (rows > 0) written += 1;
    else skipped += 1;
  }

  console.log(`    boundaries: ${written} written, ${skipped} skipped (unbuildable geometry)`);
  return written;
}

/**
 * Chunked multi-row upsert. One statement per BATCH_SIZE rows: a row-at-a-time
 * loop over ~40k roads spends its entire runtime on round-trips.
 */
async function insertBatched(table, columns, geomExpression, rows) {
  if (rows.length === 0) return 0;

  const updates = columns
    .slice(1)
    .map((c) => `${c} = EXCLUDED.${c}`)
    .concat('geom = EXCLUDED.geom', 'ingested_at = NOW()')
    .join(', ');

  let written = 0;

  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const chunk = rows.slice(offset, offset + BATCH_SIZE);
    const width = columns.length + 1;

    const values = chunk
      .map((_, index) => {
        const base = index * width;
        const scalars = columns.map((_, c) => `$${base + c + 1}`);
        const geom = geomExpression(`$${base + columns.length + 1}`);
        return `(${scalars.join(', ')}, ${geom}, NOW())`;
      })
      .join(', ');

    written += await prisma.$executeRawUnsafe(
      `INSERT INTO ${table} (${columns.join(', ')}, geom, ingested_at)
       VALUES ${values}
       ON CONFLICT (osm_id) DO UPDATE SET ${updates}`,
      ...chunk.flat(),
    );
  }

  return written;
}

async function ingestRoads(city, allRoads) {
  const [s, w, n, e] = city.bbox;
  const filter = allRoads ? '["highway"]' : `["highway"~"^(${ROAD_CLASSES})$"]`;

  const elements = await overpass(`
    [out:json][timeout:180];
    way${filter}(${s},${w},${n},${e});
    out geom;
  `);

  const rows = elements
    .filter((el) => el.geometry?.length > 1)
    .map((el) => [
      storedId(el),
      el.tags?.name ?? null,
      el.tags?.highway ?? null,
      JSON.stringify(el.tags ?? {}),
      lineWkt(el),
    ]);

  const written = await insertBatched(
    'osm.road',
    ['osm_id', 'name', 'highway', 'tags'],
    (p) => `ST_GeomFromText(${p}, 4326)::geography`,
    rows,
  );

  console.log(`    roads: ${written} written`);
  return written;
}

async function ingestPois(city) {
  const [s, w, n, e] = city.bbox;
  const clauses = POI_TAGS.map((tag) => `node["${tag}"](${s},${w},${n},${e});`).join('\n      ');

  const elements = await overpass(`
    [out:json][timeout:180];
    (
      ${clauses}
    );
    out;
  `);

  const rows = elements
    .filter((el) => typeof el.lat === 'number' && typeof el.lon === 'number')
    .map((el) => {
      const tags = el.tags ?? {};
      // First matching tag wins — a place that is both a shop and an amenity is
      // one landmark, filed under the more specific thing it is.
      const category = POI_TAGS.map((tag) => tags[tag]).find(Boolean) ?? null;
      return [storedId(el), tags.name ?? null, category, JSON.stringify(tags), pointWkt(el)];
    });

  const written = await insertBatched(
    'osm.poi',
    ['osm_id', 'name', 'category', 'tags'],
    (p) => `ST_GeomFromText(${p}, 4326)::geography`,
    rows,
  );

  console.log(`    POIs: ${written} written`);
  return written;
}

// ─────────────────────────────────────────────────────────────────────────────
// Upgrading the seeded regions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Accent- and case-insensitive comparison key. "Yaoundé" from the seed and
 * "Yaounde" from a keyboard without accents have to be the same place, and
 * requiring the `unaccent` extension for that would put an install step between
 * a fresh checkout and a working map.
 */
function nameKey(value) {
  return value
    ?.normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

/**
 * Replaces each seeded bounding box with the OSM polygon of the same name.
 *
 * Matching is by NAME, which is imprecise — so a match is only accepted when
 * exactly one OSM boundary carries that name. Two "Bastos" boundaries at
 * different admin levels means we do not know which one the region is, and
 * silently picking the first would give a whole quarter the wrong shape for as
 * long as nobody checked. Ambiguity is reported and skipped.
 */
async function upgradeGeoRegions() {
  const regions = await prisma.geoRegion.findMany({
    select: { id: true, slug: true, nameEn: true, nameFr: true },
  });

  const boundaries = await prisma.$queryRawUnsafe(
    `SELECT osm_id, name, name_en, name_fr, admin_level FROM osm.boundary`,
  );

  const byName = new Map();
  for (const boundary of boundaries) {
    for (const candidate of [boundary.name, boundary.name_en, boundary.name_fr]) {
      const key = nameKey(candidate);
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, new Set());
      byName.get(key).add(boundary.osm_id);
    }
  }

  let upgraded = 0;
  const ambiguous = [];
  const unmatched = [];

  for (const region of regions) {
    const keys = [nameKey(region.nameEn), nameKey(region.nameFr)].filter(Boolean);
    const candidates = new Set();
    for (const key of keys) {
      for (const id of byName.get(key) ?? []) candidates.add(id);
    }

    if (candidates.size === 0) {
      unmatched.push(region.slug);
      continue;
    }
    if (candidates.size > 1) {
      ambiguous.push(`${region.slug} (${candidates.size} candidates)`);
      continue;
    }

    const [osmId] = [...candidates];

    await prisma.$executeRawUnsafe(
      `
      UPDATE "GeoRegion" r
      SET "boundary" = b.geom,
          "center" = ST_Centroid(b.geom::geometry)::geography,
          "osmId" = b.osm_id,
          "areaSqKm" = ST_Area(b.geom) / 1000000.0,
          "updatedAt" = NOW()
      FROM osm.boundary b
      WHERE r."id" = $1::uuid AND b.osm_id = $2::bigint
      `,
      region.id,
      osmId,
    );

    upgraded += 1;
  }

  console.log(`  regions upgraded to real OSM boundaries: ${upgraded}/${regions.length}`);
  if (ambiguous.length > 0) {
    console.log(`    ambiguous, left as seeded: ${ambiguous.join(', ')}`);
  }
  if (unmatched.length > 0) {
    console.log(`    no OSM boundary found, left as seeded: ${unmatched.join(', ')}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const allRoads = args.includes('--all-roads');
  const named = args.filter((a) => !a.startsWith('--')).map((a) => a.toLowerCase());

  const selected = named.length > 0 ? named : Object.keys(CITIES);

  for (const key of selected) {
    if (!CITIES[key]) {
      throw new Error(`Unknown city "${key}". Known: ${Object.keys(CITIES).join(', ')}.`);
    }
  }

  console.log(`Ingesting OSM via ${OVERPASS_URL}`);

  for (const key of selected) {
    const city = CITIES[key];
    console.log(`\n  ${city.name}`);
    await ingestBoundaries(city);
    await ingestRoads(city, allRoads);
    await ingestPois(city);
  }

  console.log('');
  await upgradeGeoRegions();

  // The planner has no statistics for tables that did not exist a minute ago,
  // and a GIST index it does not know the shape of tends to lose to a
  // sequential scan — which is the exact opposite of why the index is there.
  console.log('\n  analysing…');
  for (const table of ['osm.boundary', 'osm.road', 'osm.poi', '"GeoRegion"']) {
    await prisma.$executeRawUnsafe(`ANALYZE ${table}`);
  }

  console.log('OSM ingest complete.');
}

main()
  .catch((err) => {
    console.error('OSM ingest failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
