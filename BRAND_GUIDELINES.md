# TrustPro Brand Guidelines

The visual language of TrustPro. This document is the reference the build prompts
point at (SRS §26.2), and the **60/30/10 colour ratio** below is a binding rule,
not a suggestion — it is enforced on every primary CTA and checked in review.

The design tokens themselves live in
[apps/web/app/[locale]/globals.css](apps/web/app/%5Blocale%5D/globals.css). This
document explains how to _apply_ them; that file is the single source of the
_values_. Never hardcode a hex or a pixel in a component — resolve to a token.

---

## Colour

### Palette (TMDS)

| Token          | Value     | Role                                             |
| -------------- | --------- | ------------------------------------------------ |
| Indigo         | `#3D5AFE` | Primary. Brand identity, primary buttons, links. |
| Success        | `#14B86A` | Positive states, verified, escrow released.      |
| Accent         | `#00C2A8` | **The 10%.** CTAs, hover, interactive highlights. |
| Warning        | `#F59E0B` | Caution, pending, offline indicator.             |
| Danger         | `#EF4444` | Errors, destructive actions, disputes.           |
| Neutral 50–900 | scale     | **The 60%.** Backgrounds, text, borders, surfaces. |

Neutrals are cool/indigo-tinted, never pure grey. Backgrounds are **never pure
white (`#fff`) or pure black (`#000`)** in either theme — light mode sits on
Neutral 50, dark mode on Neutral 900.

### The 60 / 30 / 10 ratio (binding)

Every screen must resolve to roughly:

- **60% neutrals** — the canvas. Backgrounds, surfaces, body text, borders. The
  interface should read as calm and mostly neutral.
- **30% Indigo** — the supporting brand colour. Primary buttons, links, active
  nav, the Trust Score ring track, section accents.
- **10% Accent (`#00C2A8`)** — reserved for _interaction_. It appears on hover
  states, interactive highlights, and **must be visibly present on every primary
  call-to-action.**

> **The load-bearing rule:** the single most important conversion action on a
> surface — the landing hero CTA, the header "Explore" button, the final dark
> CTA, the "Install app" button — uses `variant="accent"`, so Accent is the
> colour the eye is pulled to. If a primary CTA is Indigo, it is wrong.

**Why 10% and not more:** Accent earns its pull from scarcity. If Accent is used
for decoration, section backgrounds, or secondary buttons, it stops signalling
"click here" and the primary action no longer stands out. Accent is a spotlight,
not a paint.

#### Checklist (applied in review)

- [ ] The primary CTA on the surface is `variant="accent"`.
- [ ] Accent does not appear on non-interactive elements (headings, borders,
      backgrounds, body text).
- [ ] Neutrals dominate; the screen is not a wash of Indigo.
- [ ] Secondary/tertiary actions are `outline` or `ghost`, never Accent.

---

## Typography

| Use      | Family (token)                        |
| -------- | ------------------------------------- |
| Headings | Inter Tight / Geist (`--font-heading`) |
| Body     | Inter (`--font-body`)                 |
| Numbers  | IBM Plex Sans (`--font-numeric`)      |

Numeric data — Trust Scores, XAF amounts, counts, ratings — uses the numeric
font so figures align in tables and count-ups. XAF is formatted through
`next-intl` (`format.number(value, 'currency')`), never hand-assembled, and
always shows **0 decimal places** (XAF has no minor unit).

---

## Shape & elevation

| Token             | Value  |
| ----------------- | ------ |
| `--radius-card`   | 20px   |
| `--radius-input`  | 16px   |
| `--radius-button` | 14px   |
| `--radius-image`  | 24px   |

Shadows are soft, low-opacity and indigo-tinted (`--shadow-sm/md/lg`) — the
"Modern Soft Premium" style. Spacing follows an **8pt scale**.

---

## Motion

Centralised in [apps/web/lib/motion.ts](apps/web/lib/motion.ts). Rules:

- **Transform and opacity only** (plus the two named stroke exceptions —
  checkmark draw, gauge sweep — and the accordion height). Never animate layout
  properties in a loop; it drops frames.
- 0.4–0.6s, ease-out, targeting 60fps on a mid-range phone.
- **`prefers-reduced-motion` collapses every preset to 0ms** — the end state
  still applies, it just applies instantly. Backed by a global CSS media query.
- **Marketing** = expressive, directional, staggered. **App / admin** = calm,
  minimal, single quick fades. Skeletons over spinners.

---

## Surfaces & motion profile

| Surface   | Character                                              |
| --------- | ----------------------------------------------------- |
| Marketing | Animated, expressive, story-on-scroll. Lenis smooth scroll. |
| App       | Calm, fast, native scroll, minimal motion.            |
| Admin     | Dark-capable, dense, chart-heavy, productivity-first. |

---

## Landing-page hygiene (SRS §26.6)

The marketing surface is a **conversion surface**, and it is kept clean of
anything that is not conversion:

- **No internal workflow links.** No admin login, no agent login, no staff entry
  points anywhere on marketing pages — not in the header, not in the footer.
  Internal users reach their console by URL. Such links are a distraction for
  100% of visitors and a free map of privileged routes.
- **One primary action per surface**, in Accent.
- **FAQ and testimonials are database-driven** (admin CRUD), never hardcoded
  arrays — so the content is editable without a deploy.
