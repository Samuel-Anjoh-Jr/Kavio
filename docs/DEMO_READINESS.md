# Pre-investor platform test — findings and demo runbook

A full browser pass over the running platform (production build, real API,
freshly seeded PostGIS database), driven with Playwright as a live visitor
rather than through unit tests. **106 route loads** across guest, client,
worker, business, admin and agent, in EN and FR, at desktop, mobile (390×844)
and dark-mode viewports.

Screenshots of the end state are in `docs/demo-audit/`.

---

## Result

| Check | Before | After |
| --- | --- | --- |
| API boots | ❌ crashed on startup | ✅ |
| Any account can sign in | ❌ every login rejected | ✅ |
| Route loads with HTTP ≥ 400 | many | **0 / 106** |
| Route loads showing an error state | many | **0 / 106** |
| Route loads with console errors | many | **0 / 106** |
| Horizontal overflow on mobile | — | **0 / 106** |
| Post a job, end to end | ❌ 404 | ✅ published |
| Sign up → OTP → signed in | ❌ | ✅ |

---

## What was broken, and why it mattered

**1. The API did not start at all.**
Two GraphQL types were both named `PortfolioItemView` — the worker portfolio
evidence type, and the landing-page showcase type added in the most recent
commit. Schema construction threw and the process exited. Nothing worked.
Renamed the marketing one to `PortfolioShowcaseView`.

**2. No seeded account could log in.**
The seed wrote **bcrypt** hashes; the API verifies **scrypt**
(`scrypt$N$r$p$salt$key`) and returns false for anything else. Every single
demo account failed with "Invalid phone/email or password." The seed now
derives the same format with the same OWASP parameters, and `bcrypt` is gone
as a dependency.

**3. A production build returned 500 from every auth call.**
Auth.js refuses an untrusted `Host` header in production. Self-hosted
`next start` returned 500 from `/api/auth/session` on every page.
`AUTH_TRUST_HOST` is now set and documented in `.env.example`.

**4. Almost every write in the app returned 404.**
The `/api/rest` proxy allowlist still contained only `auth/`, `onboarding/`,
`uploads`, `geo/`. Posting a job, sending a quote, messaging, reviewing,
disputing, SOS, payment methods and every admin action 404'd before reaching
the API. Added the resource roots the client actually calls, and tightened
matching to whole path segments so `uploads-evil` can no longer ride in on
`uploads`.

**5. The platform's verification state contradicted itself.**
The tier the API *enforces* is derived from `VerificationRecord` rows, but the
seed never created a `PHONE` record — so every identity derived back to Tier 0
while its badge advertised "Field Verified", and every gated action refused
everyone. The seed now records the phone check. Separately, no seeded client
ever cleared ID review, and posting a job requires Tier 2, so *"post a job"
could not be completed by anyone*. Six clients now clear ID review.

**6. The tier badge made a claim the tier did not support.**
Tier 1's gate is phone-only, but its badge read **"ID Submitted"** — while the
search filter and the landing page both called the same state "Phone
verified". In a trust-first product that is a false credential. Now "Phone
Verified" / "Téléphone vérifié".

**7. Screens that failed to load.**
- Admin → Settings: `SystemSettingView.value` was non-nullable, so one
  un-overridden setting failed the whole query and blanked the panel. Also the
  seeded setting keys did not match `SETTING_REGISTRY`, so none were shown.
- Onboarding: rows were seeded with invented step keys (`review`,
  `category_selection`) that have no panel and no translations →
  `MISSING_MESSAGE`. Steps now match the server contract; the wizards also
  fall back to a known step rather than trusting a stored one.
- Job detail: `reportListing` was defined under the `Jobs` namespace but used
  from `JobDetail` → `MISSING_MESSAGE`.
- Job review step reported "Not set" for a location the previous step had just
  confirmed; now falls back to the pin coordinates.

---

## Before you demo — please do these

**Run the production build, not `pnpm dev`.**
```bash
pnpm build && pnpm --filter @trustpro/api start:prod   # API on :4000
pnpm --filter @trustpro/web start                      # web on :3000
```
`pnpm dev` shows a red **"N issues"** dev-tools badge in the bottom-left
corner on every page. Investors will see it.

**Watch the login rate limit.** Sign-in is capped at **5 attempts per minute**.
Switching between four or five role accounts back-to-back — or fumbling a
password once or twice — will produce "Too Many Requests". Space out logins,
or open each role in a separate browser profile ahead of time.

**The admin account requires 2FA, and the code only prints to the API
terminal** (SMS is deferred; the email provider is `console` at launch). Either
keep that terminal visible, or log the admin in *before* you present.

**Set `NEXT_PUBLIC_MAPBOX_TOKEN`.** Without it every map is absent and the
location picker falls back to the landmark list — which itself is empty unless
you run `pnpm db:osm:ingest`. Maps are a big part of this pitch; don't demo
them cold.

**Seed data references external images** (Unsplash portfolio shots, avatar
service). They load fine with internet, but if the venue Wi-Fi is weak the
landing page shows empty image frames. Consider a local asset fallback, or
test on the venue network first.

### Demo accounts — password `TrustPro2026!`

| Role | Account | Notes |
| --- | --- | --- |
| Client (can post jobs) | `client1@example.com` … `client6@example.com` | Tier 2, ID-verified |
| Client (shows the gate) | `client11@example.com` | Tier 0 — good for showing the anti-lure wall |
| Worker | `worker2@example.com` | Tier 3, high Trust Score |
| Business | `business1@example.com` | Team seats populated |
| Field agent | `agent.douala@trustpro.cm` | Verification queue |
| Admin | `admin@trustpro.cm` | **2FA — code prints to the API terminal** |

### A strong 5-minute path

1. Landing page (EN), scroll the Trust Engine ladder → switch to FR mid-scroll.
2. Explore workers as a **guest** — no account — open a full worker profile
   (Trust Score ring, verified checks, portfolio, reviews).
3. Click *Request a quote* → hits the login wall → sign in → **the intent
   resumes**.
4. Post a job end to end as `client1@example.com` (4-step wizard, autosave,
   XAF budget) → published.
5. Optional contrast: try it as `client11@example.com` to show the
   "Verify your identity to post a job" gate — that *is* the moat.
6. Finish in the admin console: KPIs, escrow held/released, disputes, SOS
   alerts, fraud & risk, and the audit log.

---

## Known, non-blocking

- **React hydration warning (#418)** appears in the browser console on most
  pages. Every page renders correctly — this is console-only and invisible
  unless DevTools is open, but React discards the server HTML and re-renders
  on the client, so it is worth fixing after the demo for the load-time win.
  It comes from scripts emitted among `<body>`'s direct children during SSR
  (the theme provider's blocking script and Next's bootstrap script) that are
  not part of the client render. `suppressHydrationWarning` on `<body>` does
  **not** clear it; the fix likely means moving the theme script out of the
  hydrated tree.
- **One API test is flaky in a slow environment**:
  `queue.service.integration.spec.ts` ("retries a thrown job") times out at
  20 s against a local Redis. Unrelated to any change here; 671 of 672 API
  tests and all 112 web tests pass.

---

## How this was verified

- PostgreSQL 16 + PostGIS 3.4 and Redis 7 running locally (the project's
  Docker images are unreachable from this environment, so both were installed
  natively); all Prisma migrations applied cleanly; database seeded from
  `packages/database/prisma/seed.mjs`.
- Both apps built and run in **production** mode.
- Playwright (Chromium) drove real sessions: signup with a real OTP read from
  the notification dispatcher, password login for five roles, and the admin's
  full two-factor challenge.
- Every route load recorded HTTP status, console errors, uncaught page errors,
  failed requests, error-state text, near-empty pages and horizontal overflow,
  with a full-page screenshot.
