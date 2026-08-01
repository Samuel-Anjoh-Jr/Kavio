# Kavio

_Where good work starts._

A trust-first local-services and skilled-labour marketplace for Cameroon (Douala and Yaounde first). **Web-only**: a Next.js App Router application, installable as a PWA on mobile or desktop, or used in any browser. There is no native mobile app.

The moat is **trust**, not listings: a continuously updated Trust Engine (identity, professional, marketplace, financial), progressive verification (Tiers 0-3), portfolio evidence, transparent quotes, and escrow payments via Campay. Bilingual EN/FR. Currency XAF.

## Repository structure

```
apps/web                   Next.js App Router (Bun). Marketing site + installable PWA app.
apps/api                   NestJS (Bun). REST controllers (writes) + GraphQL resolvers (reads) + PostGIS + WebSockets.
packages/api-client        Shared client config, GraphQL operations, REST mutation helpers.
packages/database          Prisma client, migrations, PostGIS/OSM SQL views, seeds.
packages/typescript-config Shared tsconfig.
scripts/                   sync-env.mjs, keygen.cjs, docker-db-backup.sh, clean.js
.github/workflows/         ci.yml, deploy-production.yml, manual-seed.yml
docker-compose.yml         Local Postgres (PostGIS) + Redis for Docker Desktop
docs/                      SRS & System Architecture (source of truth), build prompt queue (historical), demo readiness notes
```

## The dual-API rule

Reads go through **GraphQL** (Apollo Client normalized cache). Writes go through **REST** (fetch/axios), including uploads and webhooks. Never mix them.

## Prerequisites

- Node 20+, pnpm 9+, Bun 1.1+
- Docker Desktop (local Postgres + Redis)
- A filled-in `.env` at the repo root (copy `.env.example`; run `pnpm keys` to generate JWT + VAPID secrets)

## Quickstart

```bash
pnpm install
cp .env.example .env        # fill in values; pnpm keys generates secrets
pnpm dev:setup              # builds db package, starts docker, generates client, migrates, seeds
pnpm dev                    # runs web + api in parallel via turbo
```

Web: http://localhost:3000 · API: http://localhost:4000 (GraphQL at /graphql) · Prisma Studio: `pnpm db:studio`

## Root scripts (the only entry points)

| Script | What it does |
|---|---|
| `pnpm dev` / `dev:web` / `dev:api` | env:sync, then run app(s) via turbo |
| `pnpm build` / `build:web` / `build:api` | production builds |
| `pnpm db:up` / `db:down` / `db:reset` | Docker Postgres+Redis lifecycle |
| `pnpm db:migrate` / `db:migrate:deploy` / `db:generate` / `db:seed` / `db:studio` | Prisma via packages/database |
| `pnpm dev:setup` | one-shot local bootstrap |
| `pnpm lint` / `lint:i18n` / `type-check` / `test` / `full-check` | quality gates (full-check = all) |
| `pnpm keys` / `32-bytes` | generate JWT + VAPID secrets / a random 32-byte key |
| `pnpm backup:db` | pg_dump the local database into ./backups |
| `pnpm docker:up` / `docker:reset` / `docker:logs` | docker compose helpers |
| `pnpm format` / `clean` | prettier / remove build artifacts |

## CI/CD

- **ci.yml**: on every push/PR to main, the PR gate — install, typecheck, lint, test, `prisma validate`.
- **deploy-production.yml**: on push to main (or manual dispatch), validate then migrate (only when prisma files changed) with a schema-drift gate; API auto-deploys via Railway, web via Vercel.
- **manual-seed.yml**: manual dispatch, requires typing CONFIRM.

Migrations run in CI before servers boot, never at request time.

## Conventions

- TypeScript everywhere; one NestJS module per SRS module; requirement IDs (e.g. `TRU-02`, `PAY-01`) referenced in PRs.
- TMDS design system: tokens only, no hardcoded colours/spacing; motion explains change; skeletons over spinners.
- All user-facing strings via i18n (EN/FR); `pnpm lint:i18n` enforces it.
- Notifications: controllers emit events; only the dispatcher sends. SMS is feature-flagged off at launch.
- See `CLAUDE.md` for the full agent working context and `docs/` for the SRS.
