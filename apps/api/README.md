# @kavio/api

Kavio's backend: a NestJS application on the Bun runtime, exposing a **GraphQL surface for every read** and a **REST surface for every write** (uploads and webhooks included) over PostgreSQL + PostGIS.

See the root [`CLAUDE.md`](../../CLAUDE.md) and [`docs/`](../../docs) for the full architecture and requirement IDs (`TRU-02`, `PAY-01`, etc.) referenced throughout this module map.

## The dual-API rule

| Surface | Used for |
| --- | --- |
| GraphQL resolvers (`*.resolver.ts`) | All reads. Clients request exact fields; feeds the web app's Apollo cache. |
| REST controllers (`*.controller.ts`) | All writes — mutations, file uploads, Campay webhooks. |

The same feature module frequently owns both a resolver and a controller.

## Module map (`src/`)

| Module | Responsibility |
| --- | --- |
| `auth` | JWT issue/refresh, OTP, 2FA, session guards, RBAC. |
| `users` | Accounts, multi-role identities, role switching. |
| `notifications` | Event-driven dispatcher (`@nestjs/event-emitter` listeners) → `NotificationChannel` providers (web push, email; SMS stubbed behind a flag) → `NotificationLog`. |
| `trust` | Trust Score computation, trust events, tiers, endorsements, badges. |
| `storage` | Object storage (S3-compatible) for portfolio media, KYC docs, voice notes. |
| `documents` | Access control over stored documents — who may read a KYC file. |
| `verification` | Progressive verification pipeline, ID review, Founding Professional intake — this is also where field-agent/admin review work lives; there is no separate "agents" module. |
| `onboarding` | Role-specific onboarding steps and progress. |
| `geo` | OSM/PostGIS/CARTO integration, reverse geocoding, region resolution. |
| `catalog` | The admin-managed service-category taxonomy that search and job posting are scoped to. |
| `search` | Discovery: fuzzy/debounced search, filters, ranking, "no provider yet" fallback. |
| `profiles` (+ `profiles/favorites`) | Worker/Client/Business profile read+write, saved workers. |
| `business` | Teams, access levels, invitations, company (RCCM) verification. |
| `jobs` | Job lifecycle, applications, invitations. |
| `quotes` | Quotes, counter-offers, acceptance → booking + escrow initiation. |
| `payments` | Wallet, payment methods, Campay collection/payout, escrow state machine, transactions, disputes. |
| `messaging` | Conversations, messages, attachments (REST writes; delivery over `realtime`). |
| `reviews` | Reviews tied to completed jobs; feeds `trust`. |
| `safety` | SOS alerts, emergency contacts. |
| `tracking` | Consented, foreground live-location streaming for an in-progress job. |
| `moderation` | Universal reporting (any visible surface) grouped by reported item, and append-only moderation actions. |
| `marketing` | Admin-managed FAQ, testimonials, and landing-page portfolio showcase content. |
| `admin` | Cross-cutting dashboards, account directory, agent invitations, fraud/risk, announcements, audit log, RBAC, settings. Reads across other modules; writes stay owned by the module whose domain they belong to. |
| `settings` | Runtime-read platform settings (`SystemSetting`), e.g. the posting fee and verification contact channel. |
| `realtime` | WebSocket gateways for messaging, tracking, and notification push. |
| `queue` / `redis` | BullMQ job queues and the shared Redis client (notifications, webhook retries, rate limiting, WS pub/sub). |
| `graphql` | GraphQL module wiring (schema, guards). |
| `health` | Liveness/readiness endpoint. |

Import order in `app.module.ts` is deliberate and documented inline — later modules generally depend on the ones before them (e.g. `payments` after `quotes`, `moderation` last because it acts on every other module's content).

## Running this app

Always use the root scripts — this app needs Postgres/PostGIS and Redis up first:

```bash
# from the repo root
pnpm dev:setup   # docker db/redis up, prisma generate/migrate/seed
pnpm dev:api     # env:sync, build packages/database, then this app via turbo
# or
pnpm dev         # web + api together
```

API runs at http://localhost:4000 (GraphQL at `/graphql`). Prisma Studio: `pnpm db:studio` from the repo root.

## Tests

```bash
pnpm --filter @kavio/api test        # unit
pnpm --filter @kavio/api test:e2e    # e2e
pnpm --filter @kavio/api test:cov    # coverage
```

Or `pnpm test` from the repo root to run every workspace's tests via turbo.

See the root [`README.md`](../../README.md) for the full monorepo layout, environment variables, and CI/CD.
