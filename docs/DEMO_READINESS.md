# Pre-investor platform test — findings and demo runbook

A full browser pass over the running platform (production build, real API,
freshly seeded PostGIS database), driven with Playwright as a live visitor
rather than through unit tests, across guest, client, worker, business, admin
and agent, in EN and FR, at desktop, mobile (390×844) and dark-mode viewports.

Run three times: **106 route loads** on the first pass (the bug hunt below),
**76** after the trust/visibility/ranking rework, and **41** after the UI work
that completed it. Each rework changed what these pages are allowed to show, so
a clean bill of health measured before it does not carry over.

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
| Re-audit after the model rework | — | **0 / 76** clean |
| **Re-audit after the UI work** | — | **0 / 41** with an HTTP error, error state, console error or mobile overflow |

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

## The trust model, as it now behaves

This changed materially after the first pass. Three rules:

**1. Workers earn discovery; clients owe nothing.**
A worker profile appears in search, explore and the map tiles only once the
identity has verified a contact channel (phone **or** email) *and* had an ID
approved. Everyone else keeps a private profile and simply does not appear.
Clients have no KYC at all — they browse, hire, pay escrow and review freely.
The asymmetry is the product: you are trusting the person who comes to your
house, not the person who opens the door.

The gate lives in the `search.searchable_worker` view, so every reader inherits
it and none can forget it. Of 21 active seeded workers, 11 are discoverable.

**2. Hiring and advertising are different acts.**
Publishing now carries a visibility:

| | Who | Verification | Fee | On the board? |
| --- | --- | --- | --- | --- |
| `DIRECT` | Any client | None | None | No |
| `PUBLIC` | Verified business only | Owner ID **+** RCCM | Flat, admin-set | Yes |

The gate had to sit on visibility rather than on job creation: a Quote requires
a Job, and a Job must be OPEN before it can be quoted on, so gating creation
would have stopped clients hiring anyone at all. `job:create` therefore remains
on both roles and the reason is recorded in `permissions.ts`.

**3. Ranking gives everyone a turn.**
Scores are floored into bands. A band still beats the band below it, so a
clearly better worker still wins — but inside a band the order is a hash of
(worker, viewer). One visitor sees a stable order across refreshes and paging;
two visitors see different workers first. Without this the same handful sat on
top of every search forever and nobody below could earn the jobs that would
raise their score.

**Verified end to end:** a verified business publishes PUBLIC (200) and the job
appears on the board; a client publishing PUBLIC is refused (403,
`BUSINESS_VERIFICATION_REQUIRED`) while publishing DIRECT succeeds (200) and
correctly stays off the board.

### Settings that are now live

`SystemSetting` was admin-writable but nothing read it — every "setting" was
decoration. `PlatformSettingsService` is the runtime reader (cached, invalidated
on save). Two new keys, both editable in **Admin → Settings**:

- `verification.contactChannel` — `PHONE` | `EMAIL` | `EITHER`. **Seeded to
  `EMAIL`**, because SMS is a paid aggregator you have not connected and email
  is the channel that actually delivers a code today. Flip it the day SMS goes
  live; no code change.
- `jobs.postingFeeXaf` — flat charge to publish. Seeded to `0`. The fee is
  frozen onto the job at publish time, so changing it later never restates what
  past posters were charged.

### Payments without Campay

With no `CAMPAY_*` credentials there is no operator prompt and no webhook, so
escrow used to sit `PENDING` forever and every state past it — release, payout,
dispute, refund — was unreachable in dev. A stub initiation now drives the
ordinary reconciliation path: the *same* code a live webhook triggers, not a
parallel one that could drift. Inert the moment real credentials exist.

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
| **Verified business (posts to the board)** | `business1@example.com`, `business2@example.com` | Owner ID **and** RCCM approved — the only accounts that can publish a public vacancy |
| Business, not yet verified | `business3@example.com` | Shows the "get verified as a business" wall |
| Client | `client1@example.com` … `client6@example.com` | No KYC needed. Hires directly, pays escrow, reviews |
| Worker (visible in search) | `worker14@example.com`, `worker18@example.com` | Contact-verified + ID-approved |
| Worker (hidden from search) | `worker1@example.com`, `worker7@example.com` | Not yet ID-approved — shows the discovery gate |
| Field agent | `agent.douala@trustpro.cm` | Verification queue |
| Admin | `admin@trustpro.cm` | **2FA — code prints to the API terminal** |

### A strong 5-minute path

1. Landing page (EN), scroll the Trust Engine ladder → switch to FR mid-scroll.
2. Explore workers as a **guest** — no account — open a full worker profile
   (Trust Score ring, verified checks, portfolio, reviews).
3. **Refresh the search in a second browser profile.** Different visitor,
   different workers on top, same order on every refresh — the ranking gives
   everyone a turn instead of crowning the same few forever.
4. Click *Request a quote* → hits the login wall → sign in → **the intent
   resumes**.
5. Hire as `client1@example.com` — no KYC, straight to quote and escrow. This
   is the client story: trust is demanded of the person entering your home, not
   of the person opening the door.
6. Switch to `business1@example.com` and post a **public vacancy** to the job
   board. Then try the same as a client and hit
   *"Get verified as a business to post job vacancies"* — that contrast **is**
   the moat.
7. Sign in as `worker1@example.com` — an unverified worker — to show the
   **verification banner**: it names why the profile is invisible and sends the
   code inline, no page change.
8. Finish in the admin console: KPIs, escrow held/released, disputes, SOS
   alerts, fraud & risk, the audit log, and **Settings → the posting fee and
   contact channel are live switches**, not decoration. Search the account
   directory with a deliberate typo ("Fatimattou") to show it still lands.

---

## The product rework, completed

Everything from the brief is now built and verified. What each piece does:

**Worker verification banner.** A worker who fails the discovery gate is
invisible in search, and from their side an empty inbox looks exactly like a
quiet market. The dashboard now names the reason and does the next step in
place: the button *becomes* the code input (requesting a code and typing it back
are two halves of one thought; a page navigation between them is where people
drop out), then advances to the ID step, which does navigate because uploading a
document is a real task.

**Verification marks the channel actually proven.** A bug found while wiring the
banner: `PHONE_VERIFICATION` stamped `phoneVerifiedAt` unconditionally — even
when the code went to an email, which is *most* of them since SMS is not
connected. A phone nobody had proved control of was being recorded as verified,
and the discovery gate was passing on that record. It now marks whichever
channel the identifier belongs to.

**Signup asks one question fewer.** The "find work / hire" choice is gone. Every
identity holds **both** trading roles from creation, because one person is
routinely both — and asking up front plants the idea that the choice binds. It
does not: tier and Trust Score belong to the identity, which is exactly why
switching costs nothing. Holding the WORKER role grants no visibility on its
own; the discovery gate still applies.

**"Are you a business?" on-ramp.** Someone browsing workers may be a company
that would rather post one vacancy than contact fifteen people, and previously
they could only discover posting existed by failing at it. The hint offers the
RCCM route and hides itself once the identity can post.

**Posting fee, shown before the act.** Eligible posters choose visibility on the
review step and see what it costs. A fee of `0` renders as **"Free"** — a price
of zero stated as a number still reads as a charge.

**Location.** Job location already stored a pin and reverse-geocoded to quarter
+ town. Added: **Open in maps** wherever a job is shown, guests included, and an
**editable worker profile location**. The maps link is built from the place NAME,
never the coordinates — and the coordinates are deliberately not on the public
read at all. A job's pin is very often somebody's home, and the board is
browsable with no account; "Akwa, Douala" gets a stranger to the right
neighbourhood, which is all they need to decide whether to quote. On the worker
profile the quarter and town are reverse-geocoded server-side rather than
accepted from the client, so a worker cannot type themselves into a
neighbourhood they do not work in; `landmark` is their own words, in addition.

**Typo-tolerant search everywhere.** Worker search already was. The admin
account directory was not — it used substring matching, so an admin working from
a phone call who heard "Ngono" and typed "Ngonno" got "no such account" rather
than "close, try again". It now also matches on trigram similarity, on top of
(never instead of) exact matching, so a full email still returns its row first.
Verified: "Fatimatu" and "Fatimattou" both find *Fatimatou Wandji*. A trigram
index was added to keep it off a sequential scan. The job board has no search
bar to fix — it filters by category and region.

Already true before this work, and left alone: **service categories are fully
admin-configurable** (CRUD, retire/restore, reorder).

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
