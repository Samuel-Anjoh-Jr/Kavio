// Seed skeleton. Idempotent by design so it is safe to re-run (upserts, no throws
// on existing rows). Later prompts extend this with their own seed data.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const here = dirname(fileURLToPath(import.meta.url));

/**
 * Bootstrap a platform admin identity so the very first admin actions
 * (taxonomy, tier config, verification pipeline) have an actor to attribute.
 * Fully idempotent: only create + audit-log when the identity is absent, so
 * re-running the seed never duplicates rows.
 */
async function seedAdmin() {
  const ADMIN_EMAIL = 'admin@trustpro.local';

  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (existing) {
    console.log(`  admin identity already present: ${existing.id}`);
    return;
  }

  const admin = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      name: 'TrustPro Admin',
      locale: 'en',
      status: 'ACTIVE',
      roles: {
        create: [{ role: 'ADMIN', isActive: true }],
      },
    },
    include: { roles: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: 'seed.bootstrap',
      target: `User:${admin.id}`,
      meta: { roles: admin.roles.map((r) => r.role) },
    },
  });

  console.log(`  admin identity created: ${admin.id}`);
}

/**
 * Launch geography (PROMPT 38, SRS §12).
 *
 * Boundaries seeded here are APPROXIMATE bounding boxes derived from a centre
 * and a radius — enough for every spatial query to work on a laptop with no
 * network, and honest about being coarse. `pnpm db:osm:ingest` replaces them
 * with real OSM polygons and stamps `osmId` on the row.
 *
 * The upsert therefore refuses to touch any row that already carries an
 * `osmId`: re-seeding after an ingest must never downgrade a real boundary back
 * to a box. That one WHERE clause is what makes this safe to re-run forever.
 */
async function seedGeoRegions() {
  const { regions } = JSON.parse(readFileSync(join(here, 'data', 'launch-regions.json'), 'utf8'));

  // Parents must exist before their children can reference them, and the file
  // is authored parent-first. Resolving slugs to ids as we walk keeps that the
  // only ordering guarantee the data has to make.
  const idBySlug = new Map();
  const existing = await prisma.geoRegion.findMany({ select: { id: true, slug: true } });
  for (const row of existing) idBySlug.set(row.slug, row.id);

  let created = 0;
  let written = 0;

  for (const region of regions) {
    const isNew = !idBySlug.has(region.slug);
    const id = idBySlug.get(region.slug) ?? randomUUID();
    const parentId = region.parent ? (idBySlug.get(region.parent) ?? null) : null;

    if (region.parent && !parentId) {
      throw new Error(
        `launch-regions.json: "${region.slug}" names parent "${region.parent}", which is not defined above it.`,
      );
    }

    const [lat, lng] = region.center;
    const radiusM = region.radiusKm * 1000;

    // Raw SQL because `center` and `boundary` are geography columns Prisma
    // declares Unsupported — it cannot write them, by design.
    //
    // ST_Buffer on a GEOGRAPHY measures in metres, so the box is a real distance
    // around the centre rather than a naive degree offset (which would be badly
    // out of square east-west, and differently so in Douala than in Yaoundé).
    const rows = await prisma.$executeRaw`
      INSERT INTO "GeoRegion" (
        "id", "slug", "nameEn", "nameFr", "level", "parentId",
        "isActive", "createdAt", "updatedAt", "center", "boundary", "areaSqKm"
      )
      VALUES (
        ${id}::uuid,
        ${region.slug},
        ${region.nameEn},
        ${region.nameFr},
        ${region.level}::"GeoRegionLevel",
        ${parentId}::uuid,
        true,
        NOW(),
        NOW(),
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ST_Multi(
          ST_Envelope(
            ST_Buffer(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusM})::geometry
          )
        )::geography,
        ST_Area(
          ST_Envelope(
            ST_Buffer(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusM})::geometry
          )::geography
        ) / 1000000.0
      )
      ON CONFLICT ("slug") DO UPDATE SET
        "nameEn"    = EXCLUDED."nameEn",
        "nameFr"    = EXCLUDED."nameFr",
        "level"     = EXCLUDED."level",
        "parentId"  = EXCLUDED."parentId",
        "updatedAt" = NOW(),
        "center"    = EXCLUDED."center",
        "boundary"  = EXCLUDED."boundary",
        "areaSqKm"  = EXCLUDED."areaSqKm"
      WHERE "GeoRegion"."osmId" IS NULL
    `;

    idBySlug.set(region.slug, id);
    if (isNew) created += 1;
    if (rows > 0) written += 1;
  }

  console.log(
    `  geo regions: ${regions.length} in file, ${created} created, ${written} written ` +
      `(${regions.length - written} already carried a real OSM boundary and were left alone)`,
  );
}

/**
 * Starter service taxonomy (PROMPT 37 schema; ADM-02 / DIS-05 behaviour).
 *
 * Search is SCOPED to this taxonomy, so an empty one is an empty marketplace on
 * day one. Admin CRUD (PROMPT 43) is how it grows; this is only the floor.
 * Names are stored bilingually on the row because admins author them without a
 * deploy — unlike developer-authored UI copy, which stays in next-intl.
 */
const STARTER_CATEGORIES = [
  { slug: 'plumbing', nameEn: 'Plumbing', nameFr: 'Plomberie', icon: 'droplet' },
  { slug: 'electrical', nameEn: 'Electrical', nameFr: 'Électricité', icon: 'zap' },
  { slug: 'carpentry', nameEn: 'Carpentry', nameFr: 'Menuiserie', icon: 'hammer' },
  { slug: 'masonry', nameEn: 'Masonry', nameFr: 'Maçonnerie', icon: 'brick-wall' },
  { slug: 'painting', nameEn: 'Painting', nameFr: 'Peinture', icon: 'paint-roller' },
  { slug: 'welding', nameEn: 'Welding', nameFr: 'Soudure', icon: 'flame' },
  { slug: 'tiling', nameEn: 'Tiling', nameFr: 'Carrelage', icon: 'grid-3x3' },
  { slug: 'roofing', nameEn: 'Roofing', nameFr: 'Toiture', icon: 'house' },
  { slug: 'air-conditioning', nameEn: 'Air conditioning', nameFr: 'Climatisation', icon: 'wind' },
  {
    slug: 'appliance-repair',
    nameEn: 'Appliance repair',
    nameFr: 'Réparation d’appareils',
    icon: 'wrench',
  },
  { slug: 'auto-mechanic', nameEn: 'Auto mechanic', nameFr: 'Mécanique auto', icon: 'car' },
  { slug: 'cleaning', nameEn: 'Cleaning', nameFr: 'Nettoyage', icon: 'sparkles' },
  { slug: 'gardening', nameEn: 'Gardening', nameFr: 'Jardinage', icon: 'leaf' },
  { slug: 'catering', nameEn: 'Catering', nameFr: 'Traiteur', icon: 'chef-hat' },
  { slug: 'tailoring', nameEn: 'Tailoring', nameFr: 'Couture', icon: 'scissors' },
  { slug: 'hairdressing', nameEn: 'Hairdressing', nameFr: 'Coiffure', icon: 'scissors' },
  { slug: 'moving', nameEn: 'Moving & haulage', nameFr: 'Déménagement', icon: 'truck' },
  { slug: 'security', nameEn: 'Security', nameFr: 'Sécurité', icon: 'shield' },
  { slug: 'it-support', nameEn: 'IT support', nameFr: 'Assistance informatique', icon: 'laptop' },
  { slug: 'photography', nameEn: 'Photography', nameFr: 'Photographie', icon: 'camera' },
];

async function seedServiceCategories() {
  let sortOrder = 0;

  for (const category of STARTER_CATEGORIES) {
    // `workerCount` is pointedly absent from the update: it is derived from real
    // listings, and a seed re-run must never reset a live count to zero.
    await prisma.serviceCategory.upsert({
      where: { slug: category.slug },
      create: { ...category, sortOrder, isActive: true },
      update: {
        nameEn: category.nameEn,
        nameFr: category.nameFr,
        icon: category.icon,
        sortOrder,
      },
    });
    sortOrder += 1;
  }

  console.log(`  service categories: ${STARTER_CATEGORIES.length} upserted`);
}

/**
 * Marketing content for the landing page (PROMPT 92.1; SRS §26.2).
 *
 * FAQ and testimonials are database-driven, so the launch set has to come from
 * somewhere — an empty FAQ on the conversion surface is worse than no FAQ at
 * all. Ids are fixed in the data file, which is what makes these upserts
 * idempotent rather than additive.
 *
 * `isPublished` and `visible` are pointedly absent from the UPDATE branches: an
 * admin who unpublished an entry, or hid a testimonial at its author's request,
 * must not have that decision quietly reversed the next time anyone runs the
 * seed.
 */
async function seedMarketingContent() {
  const { faqs, testimonials } = JSON.parse(
    readFileSync(join(here, 'data', 'marketing-content.json'), 'utf8'),
  );

  let order = 0;
  for (const { id, ...fields } of faqs) {
    await prisma.faq.upsert({
      where: { id },
      create: { id, ...fields, order, isPublished: true },
      update: { ...fields, order },
    });
    order += 1;
  }

  order = 0;
  for (const { id, ...fields } of testimonials) {
    await prisma.testimonial.upsert({
      where: { id },
      create: { id, ...fields, order, visible: true },
      update: { ...fields, order },
    });
    order += 1;
  }

  console.log(
    `  marketing content: ${faqs.length} FAQ entries, ${testimonials.length} testimonials upserted`,
  );
}

async function main() {
  console.log('Seeding TrustPro…');
  await seedAdmin();
  await seedGeoRegions();
  await seedServiceCategories();
  await seedMarketingContent();
  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
