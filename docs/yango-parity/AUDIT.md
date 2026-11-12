# Yango parity and beyond: audit, principles and plan

Kavio · ASK-O · ASK-O Eats — revision 2 (2026-11-11)

This revision replaces the first audit. It keeps every pattern Yango gets right,
names the reason it works, and adapts that reason to each product's own model
instead of copying the screen. Status columns say what this round of work built
(`Built`), what is configured but needs your keys (`Keys`), and what stays as a
follow-up (`Next`).

Evidence: 31 photos of the Yango customer app and the Yango Pro moto driver app
(Yaoundé, Oct–Nov 2026) and a code-level read of all three repositories at the
latest `main`. Page refs: **C** = customer app photos, **D** = driver (Pro) app.

Decisions taken with the product owner (2026-11-11):

| Decision | Answer |
|---|---|
| Demand surge for delivery pricing | Built for ASK-O and Eats, admin switch, **off by default**, capped |
| Distance/traffic pricing for Kavio | **No.** Kavio stays quote-based; only platform fees are admin-configurable |
| Kavio native app | Capacitor shell, app id **`com.kavio.app`**, opens on the app shell (not the marketing site) |
| Native notifications | Use native features to the maximum where a native shell exists (all three now) |
| WhatsApp / SMS / voice escalation | Infrastructure built, every channel admin on/off, activated by adding provider keys |
| Phone number reveal on Kavio | Only after a booking is escrow-funded |
| Sounds | ASK-O brand sounds for all three apps, mapped per activity |

---

## 1. The principles behind what Yango does well

Each row: what Yango shows, **why it works** (the psychology), then how each app
applies the same reason in its own way.

### 1.1 One job, one screen, one big action (D5, D6)
Yango Pro's active order is a single sheet: address, live timer, customer name,
rating·count, class chip, **Call**, **Cancel**, and one huge **slide** button.

*Why:* under time pressure people make fewer errors when the next action is the
only prominent thing on screen (Hick's law), and a slide gesture is a deliberate
commitment that a pocket or a bump cannot trigger.

| App | Adaptation | Status |
|---|---|---|
| ASK-O | Driver and supplier alerts open a full-screen ring sheet with the order summary and a **slide-to-accept**; Decline is a small secondary button | Built |
| Eats | Same ring sheet for restaurants (accept order) and riders (claim delivery); restaurant order page keeps "next step on top" (already shipped on main) | Built |
| Kavio | Workers get a full-screen ring sheet for a funded booking or direct invitation with one big **View booking** / **View job** action and a small **Later**; "I've arrived" and "Work done" should use slide-to-confirm because they move escrow | Built (ring sheet) / Next (slide on job steps) |

### 1.2 Time is always visible (D5 timer, D6 ETA strip, C6 "14 min")
*Why:* a visible countdown or ETA converts uncertainty into a known wait, which
lowers anxiety and abandonment; for the provider it creates urgency without nagging.

| App | Adaptation | Status |
|---|---|---|
| ASK-O / Eats | Ring sheet and native alert show a **countdown** to the offer/auto-cancel deadline (native chronometer on Android) | Built |
| Kavio | Response deadline on booking requests; quote validity date on quotes | Built (ring countdown) / Next (quote expiry chip) |

### 1.3 Identity before contact (D5 name + rating · count, C10 verified badge)
*Why:* people trust a stranger faster when they see a face, a name and a track
record count ("5.00 · 28"), not a bare star average.

| App | Adaptation | Status |
|---|---|---|
| Kavio | Trust Score, tier stamp, verified checks and portfolio already lead every profile; add **job count next to rating** everywhere a worker appears | Existing / Next (count chip) |
| ASK-O | Driver card on tracking shows name, vehicle, plate, phone; add rating·count | Existing / Next |
| Eats | Rider card shows name, rating, deliveries; restaurant shows logo + name | Existing |

### 1.4 Contact in one tap, with a reason to use it (D5 "Appeler", C17 "Calls through the app only")
*Why:* when something goes wrong people want a human voice now; a visible Call
button reduces support load and cancellations. A hint tells them when calling helps.

| App | Adaptation | Status |
|---|---|---|
| Eats | **Call restaurant** button on the customer order screen with the hint *"Need to add something or running late? Call the restaurant directly."* (Call rider already existed) | Built |
| ASK-O | Seller and driver phones were already linked; add the same hint and a call action on order pushes | Built (hint) |
| Kavio | Counterparty phone **revealed only after escrow is funded**, Call + WhatsApp buttons, hint, every reveal audit-logged; before funding, chat stays in-app to protect escrow | Built |
| All | Masked calling ("calls through the app only") needs a telephony number pool | Next (needs provider) |

### 1.5 Price explained before you commit (C6 prices per option, C7 surge sheet, C14 tariff page)
*Why:* people accept a higher price when they understand why (perceived fairness);
an unexplained change feels like a trick and kills trust.

| App | Adaptation | Status |
|---|---|---|
| ASK-O / Eats | New pricing engine returns a **breakdown** (base, distance, time, traffic, region, peak, surge) so checkout can show one line per factor and a "Price a little higher" sheet when traffic or surge applies | Built (engine + API breakdown) / Next (checkout sheet UI) |
| Kavio | The ~10% fee is already shown before paying and snapshotted; platform fee is admin-configurable; **no distance pricing** (owner decision) | Existing |
| All | Public tariff page with legal entity, per-km/min, minimum, wait fee | Next |

### 1.6 Your behaviour changes your service, and you are told (C16 cancel index, D1 Priority +110)
*Why:* a visible score that rises with good behaviour is a feedback loop people
act on (goal-gradient). Hiding the rule makes penalties feel arbitrary.

| App | Adaptation | Status |
|---|---|---|
| Kavio | Reliability index for workers (on-time, completion, cancellations) shown to the worker and used in ranking; extends the Trust Engine | Next |
| ASK-O / Eats | Driver priority/acceptance score shown on the driver home; customers see their cancel index | Next |

### 1.7 Safety and trust as a checklist, not a policy page (C11 "Fully checked 6/6")
*Why:* a progress bar with ticks is completion bias: people finish a 4/6 list
they would never read as a policy. It also makes the platform look careful.

| App | Adaptation | Status |
|---|---|---|
| Kavio | "Fully checked N/N" screen mapped to Tiers 0–3 (phone, ID, selfie, trade proof, trusted contact, safety read) for workers **and** clients | Next (data exists in verification module) |
| ASK-O / Eats | Rider KYC gate exists; add a customer safety checklist (trusted contact, share trip) | Next |

### 1.8 Remember me (C3–C4 saved places, "My rides" re-request)
*Why:* recall beats recall-and-type; repeat orders are the cheapest growth.

| App | Adaptation | Status |
|---|---|---|
| Eats | Addresses and saved restaurants exist; add one-tap **re-order** from past orders | Existing / Next |
| ASK-O | Saved addresses + reorder last basket | Next |
| Kavio | "Book this worker again" from completed jobs | Next |

### 1.9 One inbox with a home for everything (D3, D7 Messages hub with "New" story cards, Warnings thread)
*Why:* sanctions, bonuses and support replies are easier to accept when they live
in a predictable place; "New" pills drive discovery without push spam.

| App | Adaptation | Status |
|---|---|---|
| Kavio | Notification Center already categorised; add a **Warnings** category and story cards for verification nudges | Existing / Next |
| ASK-O / Eats | Notification bell → hub with Support / Announcements / Warnings | Next |

### 1.10 Navigation and earnings stay in view (D6 turn banner, earnings chip "0 FCFA · 0 commandes")
*Why:* drivers work for money; seeing today's total while driving keeps motivation
and reduces app switching.

| App | Adaptation | Status |
|---|---|---|
| ASK-O / Eats | Today's earnings chip on the driver/rider map screen | Next |
| Kavio | Worker home shows escrow-pending and released totals | Existing (wallet) |

### 1.11 Never miss the job (Yango's ringing offers, persistent bubble D5–D10)
*Why:* for a provider, a missed alert is lost income; for the platform it is a
cancelled order. The alert must behave like a phone call: loud, repeating,
impossible to ignore, then escalate.

| App | Adaptation | Status |
|---|---|---|
| All | **T1 Ring tier**: looping brand ringtone, repeating vibration, full-screen call-style banner with Accept/Decline/Open, countdown, admin-configurable loop length (default 30 s), then WhatsApp → SMS → automated voice call if still unacknowledged | Built (keys needed for WhatsApp/SMS/voice) |
| All | **One-time tier** for money and status updates: one branded sound, no loop | Built |
| ASK-O / Eats | Floating bubble over other apps (Android "display over other apps") | Next (permission-heavy, Play review risk) |

### 1.12 Live status in the notification shade (Yango's branded tray card with moving icon)
*Why:* people check the shade, not the app; a single card that updates in place
(driver, ETA, progress) answers "where is it?" without opening anything.

| App | Adaptation | Status |
|---|---|---|
| ASK-O / Eats (Android) | One ongoing notification per order, updated in place: progress bar across the stages, rider name, plate, ETA, Call / Track buttons; Android 16 shows it as a Live Update | Built (native builder) |
| ASK-O / Eats (web/PWA) | Same tag replaced in place with stage text and actions | Built |
| Kavio | One notification per booking (tag `booking-<id>`) replaces the previous one; a stage card with progress is not built | Next |
| iOS | Live Activities need a Swift widget extension | Next |

### 1.13 Small honest touches
- Route options with "+2 min / +6 min" and "includes dirt roads" (D9–D10): **Next** for riders.
- "Request for someone else", "Driver instructions" (C8–C9): Eats has delivery notes; **Next** for ASK-O.
- Legal entity on About and tariff pages (C13–C14): **Next** for all.

### Where we beat Yango (keep doing these)
- **Escrow** (Kavio): money held until the client confirms. Yango has nothing like it.
- **Portfolio evidence and Trust Score** (Kavio) instead of a lone star rating.
- **Offline-first PWA** (all three): opens with no network; Yango needs data.
- **Bilingual EN/FR everywhere** with server-side templates (Kavio) — Eats push copy now translated too.
- **Readable, high-contrast UI**: Yango Pro's type is small and grey in sunlight; our tokens meet WCAG AA.

---

## 2. Full scorecard (after this round)

✅ built or already present · 🔑 built, needs provider keys · 🔜 next round · — not applicable

| Capability | Kavio | ASK-O | Eats |
|---|---|---|---|
| T1 ring alert: loop + vibrate + call-style banner (app open) | ✅ | ✅ | ✅ |
| T1 ring alert with app closed: native looping ring, full-screen, actions | ✅ (Capacitor) | ✅ | ✅ (Android) |
| T1 ring with app closed on web/PWA: high-urgency push, persistent, vibrate, actions | ✅ | ✅ | ✅ |
| Admin-configurable loop length, tiers, sounds per event | ✅ | ✅ | ✅ |
| One-time branded sounds per activity (money, updates, delivered, messages) | ✅ | ✅ | ✅ |
| Escalation ladder: re-push → WhatsApp → SMS → voice call | 🔑 | 🔑 | 🔑 |
| Escalation channels admin on/off with key status | ✅ | ✅ | ✅ |
| Rider/driver offer search survives a server restart or deploy | — | ✅ (existing Redis dispatch queue) | ✅ (DB + queue, resumes on boot) |
| Push urgency / TTL / priority set correctly | ✅ | ✅ | ✅ |
| Live order card in the notification shade, updated in place | 🔜 (same-tag replace only) | ✅ | ✅ |
| Notification tag collisions fixed, branded tray icon | ✅ | ✅ | ✅ |
| Server push copy in EN/FR | ✅ | ✅ | ✅ |
| Call the other party after commitment, with a hint | ✅ (after escrow) | ✅ | ✅ |
| Masked calls through the app | 🔜 | 🔜 | 🔜 |
| Pricing: per-km, per-min, min/max, admin-editable | — (quotes) | ✅ | ✅ |
| Pricing: traffic factor (live provider → app's own rider speeds → time-of-day) | — | ✅ | ✅ |
| Pricing: regional rates/zones | — | ✅ | ✅ |
| Pricing: peak hours (stored but never applied before) | — | ✅ | ✅ |
| Pricing: demand surge, capped, off by default | — | ✅ | ✅ |
| Price breakdown returned for an explainer | — | ✅ | ✅ |
| Customer-facing "price a little higher" sheet | — | 🔜 | 🔜 |
| Platform fee admin-configurable | ✅ (existing) | ✅ (existing) | ✅ (existing) |
| Native mobile app | ✅ new Capacitor | ✅ Capacitor | ✅ Expo + TWA |
| Live map tracking | — | ✅ | ✅ |
| Fully-checked trust checklist | 🔜 | 🔜 | 🔜 |
| Reliability / cancel index shown to the user | 🔜 | 🔜 | 🔜 |
| Re-order / re-book | 🔜 | 🔜 | 🔜 |
| Earnings chip on the provider map screen | — | 🔜 | 🔜 |
| iOS Live Activities | 🔜 | 🔜 | 🔜 |

---

## 3. Notifications: the design that was built

### 3.1 Tiers and the sound map
Every event has a profile: tier, sound, loop length, vibration and escalation.
Admins edit them; the defaults below come from measuring the ASK-O brand sounds
(duration, loudness, pitch, rhythm) and matching character to purpose.

| Sound (ASK-O brand) | Measured character | Used for | Tier |
|---|---|---|---|
| `ring_new_order` (built from `new_order`) | Loudest of the set (0 dBFS peak), 4 low bell pulses; looped as a 2.4 s cycle | Restaurant/supplier **new order to accept**; Kavio **funded booking to accept** | RING |
| `ring_new_job` (built from `available_job`) | Rising chirp, boosted +4.9 dB, played as a triple-chirp 2.6 s cycle so it is distinct from the order ring | Rider/driver **new delivery to claim**; Kavio **direct job invitation** | RING |
| `payment_success` | Loud, rising, 0.8 s ("good news") | Payment received, escrow funded/released | Once |
| `wallet_update` | Bright double "coin", 0.34 s | Payout, withdrawal, wallet credit | Once |
| `delivery_confirmation` | Sharp single strike, 1 s | Rider arrived, order delivered, work completed | Once |
| `order_update` | Soft high tone (boosted +11 dB to be audible) | Accepted, preparing, ready, picked up, quote updates | Once |
| `generic_notification` | Sustained 528 Hz tone | Messages, announcements, account notices | Once |

All files were peak-normalised to −1 dBFS so no event is accidentally quieter
than another. iOS gets 29.5 s renders of the two rings (iOS plays a notification
sound for at most 30 s, which is the closest it allows to a loop).

### 3.2 How a ring works on each surface

| Surface | App open | App closed / phone locked |
|---|---|---|
| Android native (Capacitor / Expo) | Full-screen ring sheet, looping audio | High-priority data message → `RingService` (short foreground service) plays the ring in a loop on the **ringtone** audio stream with a repeating vibration for the admin loop length; colourised call-style notification with countdown and Accept / Decline / Open; full-screen intent where Android allows it |
| iOS native | Ring sheet | Time-sensitive alert with the 29.5 s ring sound |
| Web / PWA (Android Chrome) | Ring sheet with looping audio, vibration, wake lock, app badge, title flash | High-urgency push, `requireInteraction`, strong vibration pattern, actions; re-sent by the escalation ladder |
| Web / PWA (iOS) | Ring sheet | Standard push (iOS ignores custom sound/vibration for web) |

A browser cannot loop a sound for a closed tab. That is why the ladder exists.

### 3.3 Escalation ladder (unacknowledged T1 alerts)
Default, admin-editable: **+30 s re-push → +60 s WhatsApp → +90 s SMS → +120 s
automated voice call** for ASK-O and Eats; Kavio is gentler (a booking is not a
cooling meal): **+1 min re-push → +5 min WhatsApp → +10 min SMS → +15 min call**.
It stops the moment the order is accepted, claimed, expired or cancelled (Kavio:
work accepted or refunded), or the person opens/acts on the alert; answering on
one Android phone stops the ring on the person's other phones. Each channel is off until its
provider keys are present, and admin can switch each one off independently.

### 3.4 Live order card
One notification per order (`tag`/notification id = order id) is replaced at each
stage: title = stage + ETA, body = rider/restaurant + vehicle/plate, a progress bar
(Android native) or a progress rail (web), actions Call and Track. Updates are
silent after the first so the phone does not chime at every stage.

---

## 4. Pricing (ASK-O and Eats)

Fee = clamp(min, max, round(base + km × perKm + min × perMin) × traffic × region × peak × surge), never above the market cap.

- **Distance**: straight-line × an admin *detour factor*. It ships at **1.0** so live prices do not move on deploy (parity tests prove it); **1.3 is the recommended setting** once you are ready (Yaoundé and Douala streets are far from straight).
- **Traffic** (ships **off**; switch on in Admin → Dynamic pricing): a congestion index (actual ÷ free-flow travel time) from, in order: a live traffic provider when configured (Mapbox `driving-traffic`), then **the app's own rider GPS speeds** in that region over the last 20 minutes, then an admin **time-of-day schedule**. The index maps to admin bands (light 1.00, moderate 1.10, heavy 1.25, severe 1.40 by default), so high traffic costs more and low traffic stays at base.
- **Regions**: admin-defined zones (centre + radius) with their own base / per-km / per-min / minimum overrides and a multiplier, e.g. Douala Akwa, Yaoundé Bastos, outskirts.
- **Peak hours**: the stored ASK-O peak window and multiplier are now applied (they were saved but ignored).
- **Demand surge**: open orders ÷ online riders in the zone; bands up to an admin cap; **off by default**.
- Every quote returns a **breakdown** so the customer can be told why.

---

## 5. Kavio native app

`apps/mobile`: Capacitor 8, app id `com.kavio.app`, loads the live app shell
(`<KAVIO_APP_URL>/app` → the locale's role home), not the marketing site, so every
web deploy reaches the app instantly. Built:

- FCM registration from the web app (`POST /notifications/devices` with
  `platform`, `fcmToken`, `alertsVersion`), stored next to web subscriptions.
- Android `KavioAlerts` plugin (ported from ASK-O): looping ring service on the
  ringtone stream, Indigo call-style banner with countdown and View / Later,
  full-screen over the lock screen, versioned brand channels and sounds, signed
  acknowledgement that stops the escalation ladder, deep links back into the app.
- iOS: brand sounds bundled (29.5 s ring renders), time-sensitive and push
  entitlements, AppDelegate FCM token bridge (activates once FirebaseMessaging is
  added in Xcode).
- Offline fallback page when the server cannot be reached on first launch.

Steps to build and publish: `docs/mobile/README.md` in the Kavio repo.

---

## 6. What still needs you

1. Provider keys for WhatsApp / SMS / voice (`docs/notifications/ESCALATION_SETUP.md` in each repo). Recommendation: **Twilio** for all three channels to start; Meta WhatsApp Cloud API later if volume makes it cheaper.
2. Firebase: Eats needs the `GOOGLE_SERVICES_JSON` GitHub secret (its APK could never receive push before); Kavio needs `google-services.json`, `GoogleService-Info.plist`, the APNs key, and the server `FIREBASE_*` keys.
3. Pricing is price-neutral until you change it: turn on the detour factor (1.3) and traffic in Admin → Dynamic pricing when ready; surge stays off until you choose.
4. A Mapbox token with traffic access if you want live traffic (the app's own rider speeds work without it).
5. Run the device test plans (`docs/notifications/TEST_PLAN.md` in each repo).

Known limits after this round:

- Full Android Gradle builds were not run in the build container (Maven Central rate limits); all native Java was compiled with `javac` against Android 36 and the real AndroidX/Firebase jars. Build once in Android Studio before release.
- iOS cannot loop a ring past 30 s or show a call screen for a marketplace app; the time-sensitive push plus the escalation ladder covers it. Kavio iOS needs FirebaseMessaging added in Xcode (one step, documented).
- Web browsers cannot be told to stop a ring remotely (every push must show a notification); a web ring stops on its own after the loop length.
