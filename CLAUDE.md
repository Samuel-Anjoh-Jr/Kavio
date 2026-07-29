PROJECT: Kavio, a trust-first local-services / skilled-labour marketplace for Cameroon (Douala and Yaoundé first).
WEB-ONLY: a Next.js App Router app, installable as a PWA on mobile/desktop, or used on the web. NO native mobile app.
The moat is TRUST, not listings: a continuously updated Trust Engine (identity, professional, marketplace, financial),
progressive verification (Tiers 0-3), portfolio evidence, transparent quotes, and escrow. Bilingual EN/FR. Currency XAF only.
Payments via Campay. Users are mobile-first (phone browser), low-bandwidth, non-technical.

MONOREPO (pnpm workspaces, Bun runtime):
  apps/web   Next.js App Router (TypeScript), run on Bun. Marketing site + installable PWA app. TailwindCSS + shadcn/ui
             (copied in and fully restyled to TMDS) + Anime.js v4 + Lenis + Apollo Client + next-intl + next-themes + React Hook Form + Zod.
             Maps via Mapbox GL JS. Location via the browser Geolocation API.
  apps/api   NestJS (TypeScript) on Bun. REST controllers + GraphQL resolvers + PostGIS. WebSocket gateways for real-time.
  packages/api-client        shared client config, GraphQL operations, REST mutation helpers.
  packages/database          Prisma client, migrations, PostGIS/OSM SQL views.
  packages/typescript-config shared tsconfig.
  Turborepo runs workspace tasks (turbo run dev/build/lint/type-check); Husky pre-commit; root scripts are the only entry
  point (dev, build, db:*, docker:*, env:sync, full-check). scripts/sync-env.mjs fans a single root .env out to apps.
  Local infra: docker-compose.yml with postgis/postgis (PostGIS preinstalled) + redis:7 for Docker Desktop.
  Redis roles: BullMQ queues (notifications, webhook retries), rate-limit store, WebSocket pub/sub adapter.

DUAL API RULE (do not violate):
  READS  -> GraphQL (NestJS resolvers -> Apollo Client normalized cache). Clients request exact fields.
  WRITES -> REST (NestJS controllers). All mutations, uploads, webhooks. Called via fetch/axios, bypassing the GraphQL link.
  Web streams GraphQL in RSC via @apollo/experimental-nextjs-app-support. Apollo cache is the read single-source-of-truth.

DATA: PostgreSQL + PostGIS (GIST indexes). Prisma ORM. Complex spatial ops via reviewed raw SQL / DB views, not Prisma fields.
  Index every frequent query path. No N+1: always select/include + pagination.

SPATIAL (Mapbox is presentation only, never authoritative for math):
  OSM (baseline) -> PostGIS (store/index + spatial math) -> CARTO (spatial SQL + dynamic MVT tiles) -> Mapbox GL JS (render).
  BigDataCloud for server-side reverse-geocoding. A human pin / landmark ALWAYS overrides auto-detected location.
  Real-time position uses the browser Geolocation API streamed over WebSocket while the relevant screen is open
  (web has no reliable background tracking; do foreground streaming with explicit consent).

AUTH & SECURITY: Auth.js with stateless JWT (access + refresh); secrets in a managed store. RBAC guards on every write and
  privileged read. One identity holds multiple roles (Worker, Client, Business owner, Agent, Admin); tier + Trust Score attach
  to the IDENTITY, not the role, so a role switch never re-verifies. Validate all input (Zod/DTO) before the DB. Rate-limit
  public + auth/OTP endpoints. Honeypots on public forms. KYC media (ID, selfie) is access-controlled + encrypted at rest.

NOTIFICATIONS & OTP (DISPATCHER PATTERN, LAUNCH CONSTRAINT): controllers EMIT typed domain events (@nestjs/event-emitter),
  they never call a provider directly. A NotificationDispatcher applies per-user preferences (channel x category; security
  notices bypass), selects channels by configurable priority, and delegates to providers behind a NotificationChannel
  interface: WebPush (VAPID, multi-device registry with expiry cleanup), branded Email, and a stubbed SMS provider
  (feature flag OFF; SMS is DEFERRED, paid API later). Every attempt is written to a NotificationLog (channel, provider,
  recipient, templateKey, status, error). Templates live in one localized EN/FR store keyed by templateKey, never hardcoded.
  Delivery is queued + retried via BullMQ on Redis. Phone numbers are normalised to E.164 at capture so SMS flips on later
  with zero call-site changes. OTP codes go through this same channel service (email/console at launch).

PAYMENTS & ESCROW: Campay for Mobile Money (MTN, Orange), card, bank in XAF (collection + payout). Escrow is a server-side
  state machine (Paid -> Accepted -> In Progress -> Completed -> Released; plus Refunded / Disputed). ~10% fee shown before pay.
  Every transition idempotent + reconciled against Campay webhooks (keyed by external ref). Audit-log every money/verification event.

STORAGE: AWS S3 (or compatible) for portfolio media, KYC docs, voice notes. Uploads via REST multipart with validation + signed access.

DESIGN SYSTEM (TMDS, mandatory, tokens only):
  Colours Indigo #3D5AFE, Success #14B86A, Accent #00C2A8, Warning #F59E0B, Danger #EF4444, neutral 50-900. Type: Geist/Inter Tight
  headings, Inter body, IBM Plex Sans numbers. 8pt spacing. Radius cards 20 / inputs 16 / buttons 14 / images 24. Soft shadows.
  Light + dark. Style "Modern Soft Premium". Motion via Anime.js v4: explains change, transform/opacity only, 60fps, respect
  prefers-reduced-motion, skeletons over spinners. Marketing = animated profile; app/admin = calm; admin dark/dense/chart-heavy.

ACCESS MODEL: The guest first-interface lets UNAUTHENTICATED visitors fully browse and explore the platform (search workers, browse posted jobs, open full worker profiles, basic exploration) with NO account, to showcase the platform's potential and drive sign-up; once authenticated, users see a ROLE-BASED home for their active role (Worker/Client/Business), not the guest view. Every state-changing action
  (post/apply/contact/pay/save/review) requires login, then RESUMES the original intent. The marketing landing page is separate
  from the installable app shell and is EXCLUDED from the service-worker scope (fast, crawlable, SEO-first).

ENGINEERING STANDARDS (every prompt): central structured JSON logger (level, scope, requestId, durationMs, sanitised summary, no
  secrets); requestId generated in the first middleware, in every log line, returned in error responses; log info (req in/out, DB done),
  warn (slow query >300ms), error (DB/payment/unhandled); app/global-error.tsx from the start; every mutating form has inline
  success/error + field validation, no silent failures; accurate auth errors (credentials vs session); migrations run at deploy only
  (prisma migrate deploy in CI before boot; migration_lock.toml committed; .sql UTF-8 no BOM); public pages static/ISR; SEO on
  marketing; full EN/FR, no hardcoded strings; CI gate = typecheck + lint + tests + prisma validate + clean high/critical security scan.

DEFINITION OF DONE (every PR): typechecks; lints; tests for new logic; reads via GraphQL/Apollo and writes via REST/fetch; RBAC
  enforced; inputs validated; indexes added for new query paths; loading/empty/error states; EN/FR strings; a11y (keyboard, focus,
  contrast, reduced-motion); requestId logging; no secrets committed; PR references the SRS requirement IDs + the PROMPT number.

CONVENTIONS: TypeScript everywhere. One NestJS module per SRS module. Shared types + GraphQL ops + Prisma client in packages/*.
  Brand token: "Kavio". Add each feature's Prisma models + migration inside the prompt that introduces the feature (incremental schema).
