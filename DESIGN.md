# Kavio design direction

Source of truth for the look, motion and voice of every Kavio surface. It sits
on top of [BRAND_GUIDELINES.md](BRAND_GUIDELINES.md) (TMDS, binding) and
[CLAUDE.md](CLAUDE.md): it never changes a TMDS token value, it decides how the
tokens are used. If a request conflicts with this file, flag it before
building.

## Product truth

Kavio connects households and businesses in Cameroon with skilled workers
(electricians, plumbers, welders, painters, cleaners). The person hiring is on
a mid-range Android phone, often on mobile data, and is afraid of three
things: a stranger in the house, a deposit that disappears, a price that
changes at the door. Kavio answers each with something you can check: a Trust
Score built from verified ID and real work, photos of past jobs, a fixed
quote, and escrow that only pays out when the client confirms.

The feeling to create: **a record you can check.** Calm, factual, slightly
official, like a stamped document or a Mobile Money receipt. Never hype.

## References (what we take from each)

| Reference                                    | Trait we take                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| A stamped identity document                  | Verification as stamps that land on a record; tier as an official mark |
| An MTN MoMo / Orange Money receipt           | Money shown as itemised lines with a reference, in XAF, no decimals    |
| A bank statement                             | Escrow as a sequence of states, each with a time and an amount         |
| Product UI used as the hero (Linear, Stripe) | Show the actual record instead of illustrations or stock portraits     |

## Palette with roles (TMDS, unchanged values)

| Token             | Value                                       | Job on marketing                                           |
| ----------------- | ------------------------------------------- | ---------------------------------------------------------- |
| `--background`    | Neutral 50 `#F8F9FC`                        | Canvas, about 60% of every screen                          |
| `--surface`       | `#FDFDFF` (indigo-tinted, never pure white) | Records, receipts, cards                                   |
| `--foreground`    | Neutral 900 `#1B1E2E`                       | Text and the one dark CTA band                             |
| Indigo `#3D5AFE`  | `--primary`                                 | Trust Score ring, active nav, links, state rail. About 30% |
| Accent `#00C2A8`  | `--accent`                                  | The primary CTA on each surface and its hover. About 10%   |
| Success `#14B86A` | `--success`                                 | Verified stamps, released escrow                           |
| Warning / Danger  | `--warning` / `--danger`                    | Pending and disputed escrow only                           |

Contrast fixes made in this pass: Accent and Success fills now carry Neutral
900 text (`--accent-foreground`, `--success-foreground`). White on `#00C2A8` is
2.3:1 and white on `#14B86A` is 2.6:1, both below WCAG AA; Neutral 900 on
either is above 6:1. `--surface` moved off pure white per the TMDS rule.

## Type roles

- **Headings: Inter Tight 600**, tracking -0.02em on display sizes, sentence
  case, at most three lines on a 390px phone.
- **Body: Inter 400/500**, 16px minimum, 1.6 line height for paragraphs.
- **Numbers: IBM Plex Sans 500/600** for every Trust Score, XAF amount,
  percentage and count, with tabular figures so count-ups do not jitter.

## Layout idea

Product-led and asymmetric. The hero is a real Trust Record, not portraits.
Sections alternate text-led and record-led columns; headings sit left, never
centred over three equal cards. The escrow section is a state rail plus a
receipt, the same objects the app shows after a booking.

## Signature element

**The Trust Record.** A worker record with the Trust Score ring, the four
Trust Engine pillars (identity, work evidence, platform record, payments) as
bars, and verification stamps that land one after another. It appears in the
hero (an example record, labelled as such), drives the Trust Engine section
(the ring climbs 15, 35, 60, 82, 100 as you scroll the stages) and closes in
the escrow receipt.

## Motion (Level 2: expressive on marketing, calm in the app)

- First paint (hero): CSS keyframes, so the motion never waits for
  hydration on a slow phone. Headline words rise from a mask, the ring
  sweeps to 82 while the number counts, pillar bars fill 60ms apart, then
  the stamps land (scale 1.15 to 1, slight rotation). About 1.6s total.
- Everything triggered by scroll or input uses the Anime.js v4 presets in
  `apps/web/lib/motion.ts`: section reveals (16px rise, 500ms, 60ms stagger),
  the sticky Trust Engine ring that animates between stage scores, the
  escrow token moving Paid → Accepted → In progress → Completed → Released,
  and the one count-up group.
- Header: a sliding indicator follows the active section.
- Hero primary CTA is magnetic on fine pointers only (max 6px).
- Portfolio: the first before/after card nudges its handle once when it
  enters view, to show it can be dragged.
- Testimonial marquee pauses on hover and focus and has a visible
  pause/play button.
- Lenis on marketing routes only. Page transitions run on navigation,
  never on first load.
- Reduced motion: every preset collapses to 0ms and lands on its final
  state; Lenis stops smoothing the wheel; nothing is pinned or looped.
- Transform and opacity only, plus the two named stroke exceptions (gauge
  sweep, checkmark draw).

## Proof and numbers

Only sourced numbers appear on marketing. The count-up group shows the
27-respondent user survey that shaped the product (SRS §1.3), with the source
line under it. Platform totals (workers verified, XAF paid through escrow)
return only once they come from a live API read, never typed into copy.

## Boldness budget

Spent on the Trust Record and the scroll-driven ring. Colour stays quiet:
mostly neutrals, indigo for trust, one accent button per view.

## Ban list for this project

- Stock or illustrated portraits standing in for workers
- Pill badges above headlines; centred chip clouds; three equal centred
  cards as a "how it works"
- Gradient text, gradient icon tiles, glow, more than one glass surface (the
  scrolled header)
- Any statistic without a source line; ratings or totals not read from the API
- Accent on headings, borders, backgrounds or body text
- Title Case headings and buttons; em dashes in copy
- Copy words: seamless, revolutionary, unlock, elevate, game-changer,
  cutting-edge, world-class, hassle-free, "trusted by thousands"
- Hardcoded strings: every word goes through next-intl, written natively in
  EN and FR
