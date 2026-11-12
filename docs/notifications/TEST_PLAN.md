# Ringing alerts, escalation and phone reveal: device test plan (Kavio)

Run before releasing the app and the web build. Note the phone model and
Android/iOS version for every failure.

## Devices and accounts

A **Tecno or Infinix**, a **Samsung**, an **Android 14+** phone, an
**iPhone**, desktop Chrome, and Android Chrome with the installed PWA.
Accounts: a client, a worker (with a phone number), an admin with a phone
number on the profile. Use Campay sandbox for payments.

Precondition: Firebase configured and the app built with `google-services.json`
(docs/mobile/README.md). The API log shows the worker's device saved with
`platform=ANDROID alertsVersion=2`.

## A. Worker: funded booking rings

| # | Setup | Action | Expected | ✔ |
|---|---|---|---|---|
| A1 | Worker has Kavio open in Chrome (one click on the page first) | Client funds the booking | Full-screen ring sheet, looping `ring_new_order`, countdown, **View booking / Later** | |
| A2 | Same | Tap View booking | Job screen opens, ring stops, no WhatsApp/SMS later | |
| A3 | Browser tab closed, push enabled | Client funds | Notification stays until acted on, View booking / Later buttons, Kavio icon and K badge | |
| A4 | App closed, screen locked (Android app) | Client funds | Rings like a call for the ring length; Indigo call-style banner with countdown (full-screen if allowed) | |
| A5 | Same | Tap View booking | App opens on the job; escalation stops | |
| A6 | Worker has the Android app on two phones | Tap View booking on one | The other phone stops ringing within seconds (a browser ring stops on its own after the ring length) | |
| A7 | Nobody acts | Wait | Ring stops after the ring length; notification stays; escalation continues | |
| A8 | Admin sets `notifications.ringLoopSeconds` = 15 | Fund again | Ring lasts 15 s on web and app | |

## B. Job invitation

| # | Action | Expected | ✔ |
|---|---|---|---|
| B1 | Client invites the worker (app closed) | Rings with `ring_new_job` (triple chirp), "View job / Later", no escalation | |

## C. One-time sounds

| # | Event | Expected | ✔ |
|---|---|---|---|
| C1 | Client releases escrow | One `payment_success` sound, no loop | |
| C2 | Refund | `wallet_update` | |
| C3 | Quote received / accepted | `order_update` | |
| C4 | Message | `generic_notification` | |
| C5 | Category set to silent in preferences, quote arrives | No sound; a funded booking still rings | |
| C6 | French profile | All notification text and buttons in French | |

## D. Phone reveal

| # | Setup | Expected | ✔ |
|---|---|---|---|
| D1 | Quote accepted, escrow NOT paid | Job screen: lock card "number appears once payment is secured", no number in the GraphQL response | |
| D2 | Escrow paid | Client sees worker name, number, **Call** and **WhatsApp** + the hint; worker sees the client's | |
| D3 | A third user queries `bookingContact` for that booking | Nothing returned | |
| D4 | Booking refunded / cancelled | "This booking is closed" | |
| D5 | Audit log | `booking.contact_revealed` entry, without the number | |

## E. Escalation (test keys)

| # | Action | Expected | ✔ |
|---|---|---|---|
| E1 | Enable WhatsApp in `notifications.alerts`, worker ignores a funded booking | WhatsApp template at +5 min with the booking link | |
| E2 | Enable SMS | SMS at +10 min | |
| E3 | Enable voice | Call at +15 min speaks the message (FR/EN) | |
| E4 | Worker opens the alert at +6 min | Nothing after the WhatsApp step | |
| E5 | Inspect `AlertDelivery.outcomes` | One entry per step with provider, ok, ref/error | |

## F. Regression

`pnpm full-check` passes; existing web push subscriptions keep working
(old service worker clients get the same title/body/url); email notifications
unchanged; bookings, escrow and payouts unchanged.
