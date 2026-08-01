-- ─────────────────────────────────────────────────────────────────────────────
-- Seed the baseline service-category taxonomy.
--
-- This is reference data, not demo content: the "What category?" picker on
-- job posting (and on a worker's own services) reads straight from this
-- table, so a freshly deployed database with zero demo users still needs it
-- to offer anything at all. Seeded here (not prisma/seed.mjs, which also
-- creates fake accounts and is never run against production) so the taxonomy
-- is correct the moment migrations finish, mirroring how TierConfig's
-- baseline rows are seeded in 20260721140000_trust_engine.
-- ON CONFLICT DO NOTHING so a re-deploy never overwrites an admin's edits.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO "ServiceCategory" ("id", "slug", "nameEn", "nameFr", "descriptionEn", "descriptionFr", "icon", "sortOrder", "createdAt", "updatedAt")
VALUES
    (gen_random_uuid(), 'plumbing', 'Plumbing', 'Plomberie', 'Professional plumbing services, vetted through Kavio''s tiered verification.', 'Services professionnels de plomberie, vérifiés via le système de niveaux de confiance Kavio.', 'wrench', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'electrical', 'Electrical', 'Électricité', 'Professional electrical services, vetted through Kavio''s tiered verification.', 'Services professionnels de électricité, vérifiés via le système de niveaux de confiance Kavio.', 'bolt', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'carpentry', 'Carpentry', 'Menuiserie', 'Professional carpentry services, vetted through Kavio''s tiered verification.', 'Services professionnels de menuiserie, vérifiés via le système de niveaux de confiance Kavio.', 'hammer', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'painting', 'Painting', 'Peinture', 'Professional painting services, vetted through Kavio''s tiered verification.', 'Services professionnels de peinture, vérifiés via le système de niveaux de confiance Kavio.', 'paint-roller', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'cleaning', 'Cleaning', 'Nettoyage', 'Professional cleaning services, vetted through Kavio''s tiered verification.', 'Services professionnels de nettoyage, vérifiés via le système de niveaux de confiance Kavio.', 'broom', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'gardening', 'Gardening', 'Jardinage', 'Professional gardening services, vetted through Kavio''s tiered verification.', 'Services professionnels de jardinage, vérifiés via le système de niveaux de confiance Kavio.', 'seedling', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'moving', 'Moving', 'Déménagement', 'Professional moving services, vetted through Kavio''s tiered verification.', 'Services professionnels de déménagement, vérifiés via le système de niveaux de confiance Kavio.', 'truck', 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'security', 'Security', 'Sécurité', 'Professional security services, vetted through Kavio''s tiered verification.', 'Services professionnels de sécurité, vérifiés via le système de niveaux de confiance Kavio.', 'shield', 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'appliance-repair', 'Appliance Repair', 'Réparation d''Électroménager', 'Professional appliance repair services, vetted through Kavio''s tiered verification.', 'Services professionnels de réparation d''électroménager, vérifiés via le système de niveaux de confiance Kavio.', 'washing-machine', 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'masonry', 'Masonry', 'Maçonnerie', 'Professional masonry services, vetted through Kavio''s tiered verification.', 'Services professionnels de maçonnerie, vérifiés via le système de niveaux de confiance Kavio.', 'trowel', 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'tiling', 'Tiling', 'Carrelage', 'Professional tiling services, vetted through Kavio''s tiered verification.', 'Services professionnels de carrelage, vérifiés via le système de niveaux de confiance Kavio.', 'grid', 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'welding', 'Welding', 'Soudure', 'Professional welding services, vetted through Kavio''s tiered verification.', 'Services professionnels de soudure, vérifiés via le système de niveaux de confiance Kavio.', 'flame', 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "ServiceCategory" ("id", "slug", "nameEn", "nameFr", "descriptionEn", "descriptionFr", "parentId", "sortOrder", "createdAt", "updatedAt")
VALUES
    (gen_random_uuid(), 'pipe-installation', 'Pipe Installation', 'Installation de Tuyauterie', 'A specialisation within Plumbing.', 'Une spécialisation au sein de Plomberie.', (SELECT id FROM "ServiceCategory" WHERE slug = 'plumbing'), 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'leak-repair', 'Leak Repair', 'Réparation de Fuites', 'A specialisation within Plumbing.', 'Une spécialisation au sein de Plomberie.', (SELECT id FROM "ServiceCategory" WHERE slug = 'plumbing'), 13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'water-heater-install', 'Water Heater Installation', 'Installation de Chauffe-eau', 'A specialisation within Plumbing.', 'Une spécialisation au sein de Plomberie.', (SELECT id FROM "ServiceCategory" WHERE slug = 'plumbing'), 14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'house-wiring', 'House Wiring', 'Câblage Domestique', 'A specialisation within Electrical.', 'Une spécialisation au sein de Électricité.', (SELECT id FROM "ServiceCategory" WHERE slug = 'electrical'), 15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'solar-installation', 'Solar Panel Installation', 'Installation de Panneaux Solaires', 'A specialisation within Electrical.', 'Une spécialisation au sein de Électricité.', (SELECT id FROM "ServiceCategory" WHERE slug = 'electrical'), 16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
