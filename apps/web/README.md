# @kavio/web

Kavio's Next.js App Router application: the public marketing site and the installable PWA app, in one codebase.

- **Marketing** (`app/[locale]/(marketing)`): the conversion-optimised, SEO-facing public site. Static/ISR, excluded from the service-worker scope.
- **App** (`app/[locale]/app`): the installable PWA — guest browsing, role-based dashboards (Worker/Client/Business/Agent/Admin), verification, messaging, escrow.
- **Auth** (`app/[locale]/auth`): sign-up/sign-in, OTP, split-screen shell shared with the rest of the app.

See the root [`CLAUDE.md`](../../CLAUDE.md) and [`docs/`](../../docs) for the full architecture, and [`BRAND_GUIDELINES.md`](../../BRAND_GUIDELINES.md) for the design system (TMDS).

## Stack

TypeScript, Bun runtime, TailwindCSS + shadcn/ui (copied in and restyled to TMDS), Anime.js v4 + Lenis, Apollo Client (`@apollo/experimental-nextjs-app-support` for RSC streaming), next-intl (EN/FR), next-themes, React Hook Form + Zod, Mapbox GL JS.

## The dual-API rule

Reads go through **GraphQL** against `apps/api`, via the Apollo Client normalized cache. Writes (mutations, uploads) go through **REST**, via `fetch`/`axios`, bypassing the GraphQL link entirely. Never mix them.

## Running this app

Always use the root scripts (never run `dev`/`build` from inside this directory directly against a cold environment — the API, Postgres/PostGIS, and Redis need to be up first):

```bash
# from the repo root
pnpm dev:setup      # one-time: docker db/redis up, prisma generate/migrate/seed
pnpm dev:web         # env:sync, then this app only, via turbo
# or
pnpm dev             # web + api together
```

Web runs at http://localhost:3000. The API (GraphQL + REST) must be running at the URL configured by the root `.env` for reads/writes to work.

## Conventions

- All user-facing strings go through `next-intl` (EN/FR) — `pnpm lint:i18n` (from the repo root) fails the build on hardcoded strings.
- All colour, spacing, radius, type, and motion values resolve to TMDS tokens (`app/[locale]/globals.css`); never hardcode a hex or a pixel.
- Motion is centralised in `lib/motion.ts`: transform/opacity only, respects `prefers-reduced-motion`.
- Every mutating form shows inline success/error feedback; every list has loading/empty/error states.

See the root [`README.md`](../../README.md) for the full monorepo layout, environment setup, and CI/CD.
