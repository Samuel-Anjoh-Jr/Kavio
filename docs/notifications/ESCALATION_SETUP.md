# Ringing alerts, escalation and phone reveal: setup guide (Kavio)

Everything is built. Paid channels (WhatsApp, SMS, voice) ship **off**; this
guide is what you do to switch each piece on. No code change is needed.

## 0. What happens when a client funds a booking

1. The worker's phone **rings like a call** for the configured length
   (admin setting `notifications.ringLoopSeconds`, default 30 s, 5–120):
   looping `ring_new_order` brand ringtone, repeating vibration, a call-style
   banner with **View booking / Later** and a countdown, full-screen over the
   lock screen in the Android app where allowed. In a browser or installed
   PWA the notification stays on screen until acted on; with Kavio open, a
   full-screen ring sheet loops the sound.
2. If the worker does not open it, the **escalation ladder** runs (default
   for Kavio, gentler than food delivery): re-push at +1 min → WhatsApp at
   +5 min → SMS at +10 min → automated voice call at +15 min.
3. It stops as soon as the worker accepts the work, opens the alert, the
   booking is refunded, or 60 minutes have passed.

A **job invitation** rings with `ring_new_job` (triple chirp) and does not
escalate. An **SOS** rings and does not escalate (safety has its own flow).
Money (escrow released, payment), quotes, applications and messages play one
brand sound once. Marketing is silent.

| Event (templateKey) | Tier | Sound |
|---|---|---|
| `payment.received` (client funded escrow) | ring + escalation | `ring_new_order` |
| `job.invitation_received` | ring | `ring_new_job` |
| `safety.sos_triggered` | ring | `ring_new_order` |
| `escrow.released`, `payment.*` | once | `payment_success` |
| `escrow.refunded` | once | `wallet_update` |
| `escrow.work_completed`, `escrow.work_accepted` | once | `delivery_confirmation` |
| `quote.*`, `job.*`, other `escrow.*` | once | `order_update` |
| messages, trust, account | once | `generic_notification` |
| `MARKETING` category | silent | — |

A user who set a category to "silent" in their own notification preferences
keeps silence, except for rings.

## Admin settings (Admin → Settings → notifications)

- `notifications.ringLoopSeconds`: a number, 5–120.
- `notifications.alerts`: JSON, merged over the defaults above and clamped, so
  a bad value can never silence a booking ring. Example that turns WhatsApp
  and SMS on and makes `quote.accepted` ring:

```json
{
  "templates": { "quote.accepted": { "tier": "ring", "sound": "ring_new_order", "loopSeconds": 20 } },
  "escalation": {
    "enabled": true,
    "steps": [
      { "afterSeconds": 60, "channel": "push" },
      { "afterSeconds": 300, "channel": "whatsapp" },
      { "afterSeconds": 600, "channel": "sms" },
      { "afterSeconds": 900, "channel": "voice" }
    ],
    "channels": {
      "whatsapp": { "enabled": true, "provider": "twilio" },
      "sms": { "enabled": true, "provider": "twilio" },
      "voice": { "enabled": false, "provider": "twilio" }
    }
  }
}
```

A channel that is enabled but has no keys is skipped and logged; it never
fails the ladder.

## 1. Which provider to choose

| Need | Recommended | Why |
|---|---|---|
| WhatsApp + SMS + voice in one place | **Twilio** | One account and one set of keys covers all three channels to +237 numbers; inline voice script (no callback server); per-message logs in their console |
| Cheapest WhatsApp | **Meta WhatsApp Cloud API** | Direct from Meta, no reseller margin; needs an approved template |
| Alternative SMS / voice | Africa's Talking | Popular in Africa; **check that your account covers Cameroon** before relying on it |

Start with Twilio for everything. Switch WhatsApp to Meta later if volume
makes the price difference matter. Prices change: check each provider's
pricing page for Cameroon before switching a channel on.

## 2. Twilio (SMS, voice, WhatsApp)

1. Create an account at twilio.com and **upgrade it** (trial accounts can only
   message numbers you verified by hand).
2. Console → Account → **API keys & tokens**: copy the *Account SID* and
   *Auth token* into `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.
3. **Voice + SMS sender**: Console → Phone Numbers → Buy a number with Voice
   and SMS capability (local Cameroon numbers are often unavailable; an
   international number works). Put it in `TWILIO_VOICE_FROM` and
   `TWILIO_SMS_FROM_NUMBER` (E.164, e.g. `+15551234567`).
   - Optional: create a *Messaging Service* (better deliverability, sender
     pools) and set `TWILIO_MESSAGING_SERVICE_SID` instead of `TWILIO_SMS_FROM_NUMBER`.
   - Alphanumeric sender IDs ("KAVIO") for Cameroon may need registration with
     Twilio support; numeric senders work without it.
4. **WhatsApp sender**: Console → Messaging → Senders → WhatsApp senders →
   register your business number. This links a Meta Business account and can
   take a few days for Meta verification. Put the number in
   `TWILIO_WHATSAPP_FROM_NUMBER` (the variable Kavio already uses for WhatsApp OTP).
5. **WhatsApp templates** (required: alerts are business-initiated): Console →
   Messaging → Content Template Builder → create two templates (English and
   French) with three body variables, e.g.

   - EN: `{{1}} — {{2}}. Open Kavio to respond: {{3}}`
   - FR: `{{1}} — {{2}}. Ouvrez Kavio pour répondre : {{3}}`

   Submit them for WhatsApp approval, then put their SIDs (`HX…`) in
   `TWILIO_WHATSAPP_CONTENT_SID_EN` and `TWILIO_WHATSAPP_CONTENT_SID_FR`.
   Variables sent: 1 = title, 2 = body, 3 = link to the booking.

## 3. Meta WhatsApp Cloud API (optional, instead of Twilio WhatsApp)

1. developers.facebook.com → Create app → *Business* → add the **WhatsApp**
   product. Add and verify your business phone number.
2. WhatsApp → API setup: copy the **Phone number ID** into
   `META_WHATSAPP_PHONE_NUMBER_ID`.
3. Business settings → System users → create a system user with
   `whatsapp_business_messaging` permission → generate a **permanent token**
   → `META_WHATSAPP_TOKEN`.
4. WhatsApp Manager → Message templates → create `urgent_alert` (category
   *Utility*) in **English** and **French**, body with three variables
   (title, body, link). Wait for approval. Set `META_WHATSAPP_TEMPLATE` to the
   template name if you chose another.
5. In the admin setting `notifications.alerts`, set `escalation.channels.whatsapp.provider` to `"meta"`.

## 4. Africa's Talking (optional)

1. Create an account, confirm Cameroon is supported for SMS/voice on it.
2. Settings → API key → `AFRICASTALKING_API_KEY`; your username →
   `AFRICASTALKING_USERNAME`. Optional sender ID → `AFRICASTALKING_SMS_FROM`.
3. Voice: buy a voice number → `AFRICASTALKING_VOICE_FROM`, and set the
   number's callback URL to `https://<api-host>/alerts/voice/africastalking`.
   (Single API instance only; with several replicas use Twilio voice.)

## 5. Server settings

Add to the API environment (all listed in `.env.example`):

```
FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY   # native app push
ALERTS_PUBLIC_API_URL=https://<your-api-host>   # signed "seen it" links
ALERTS_ACK_SECRET=<long random string>          # optional, defaults to JWT_ACCESS_SECRET
```

Run `prisma migrate deploy` (CI does) so the `AlertDelivery` table and the
`DeviceRegistration.alertsVersion` column / `ANDROID`, `IOS` platforms exist.

## 6. Phone number reveal

The booking's job screen shows a **Call / WhatsApp** card with the other
party's number **only once escrow is funded** (booking `PAID`, `ACCEPTED`,
`IN_PROGRESS` or `COMPLETED`) and only to the client and the worker. Before
that it explains that the number appears once payment is secured. Every
reveal is audit-logged as `booking.contact_revealed` (the number itself is
never logged). The client sees the hint: "They have already been alerted like
a phone call. If they don't respond quickly, call them."

## 7. Native app

See `docs/mobile/README.md` (Firebase project, `google-services.json`,
signing, iOS steps).

## 8. Cost and safety guards (built in)

- Paid channels run only for `payment.received` (the only escalating
  event by default), never for money or status updates.
- The ladder closes the moment the booking moves on (work accepted, refunded), or the worker opens the alert on any device.
- The ladder never runs longer than 60 minutes after the first ring.
- Every step's outcome (provider, ok, error, message id) is stored on
  `AlertDelivery.outcomes` and logged with the requestId; keys and phone
  numbers are never logged.
