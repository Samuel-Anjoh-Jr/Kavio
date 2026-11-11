# Kavio native app (Android + iOS)

`apps/mobile` is a Capacitor 8 shell, app ID **`com.kavio.app`**. It loads the
live Kavio app (`<KAVIO_APP_URL>/app`, the same screens as the PWA) and adds
what a browser cannot do:

- **FCM push that wakes a closed app.** The web app registers the device's
  FCM token (`POST /notifications/devices` `{platform, fcmToken, alertsVersion}`)
  the first time a signed-in user opens it.
- **Phone-call style rings** (Android): when a client funds a booking or
  invites a worker, `KavioAlerts` loops the brand ringtone and vibration in a
  short foreground service, shows a coloured call-style banner with
  **View / Later** and a countdown, and goes full-screen over the lock
  screen when allowed. Tapping a button acknowledges the ring so the
  WhatsApp/SMS/voice escalation stops.
- **Brand notification channels and sounds** (the ASK-O brand set) for
  payments, wallet, bookings and quotes, general.
- **iOS**: time-sensitive pushes with the brand sounds (rings use a 29.5 s
  render, the iOS limit).

Because the UI is served from the web, every web deploy reaches the app at
once. Only native changes (this folder) need a store release.

## One-time setup

1. **Firebase**: in the Firebase console, create (or reuse) a project.
   - *Add app → Android*, package `com.kavio.app`, download
     `google-services.json` to `apps/mobile/android/app/` (git-ignored).
   - *Add app → iOS*, bundle ID `com.kavio.app`, download
     `GoogleService-Info.plist` to `apps/mobile/ios/App/App/` (git-ignored),
     then upload your APNs key (Project settings → Cloud Messaging).
   - *Project settings → Service accounts → Generate new private key*: put
     its `project_id`, `client_email`, `private_key` into the API's
     `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.
2. `pnpm install` at the repo root.

## Android build

```bash
cd apps/mobile
KAVIO_APP_URL=https://<your-domain> pnpm sync
pnpm android:open          # Android Studio: Run, or Build → Generate Signed Bundle
```

Release signing: create a keystore once (`keytool -genkey -v -keystore
kavio-release.jks -alias kavio -keyalg RSA -keysize 2048 -validity 10000`),
keep it out of git, and sign the bundle from Android Studio or Gradle.

Google Play: in *App content* declare the **full-screen intent** use
("incoming booking alerts, like a call") and the `shortService` foreground
service. Android 14+ users may need to allow *full-screen notifications* for
Kavio; until then the ring is a heads-up banner that still loops.

Ask workers to set battery usage to **Unrestricted** and allow **Autostart**
(Tecno, Infinix, itel and Xiaomi stop background apps aggressively).

## iOS build (needs a Mac with Xcode)

1. `KAVIO_APP_URL=https://<your-domain> pnpm sync`, then `pnpm ios:open`.
2. In Xcode → *File → Add Package Dependencies* → `https://github.com/firebase/firebase-ios-sdk`
   → add **FirebaseMessaging** (and FirebaseCore) to the **App** target. The
   AppDelegate turns this on automatically (`#if canImport(FirebaseMessaging)`)
   and hands the FCM token to the web app; without it, iOS registers nothing.
3. *Signing & Capabilities*: your team; **Push Notifications** and **Time
   Sensitive Notifications** are already declared in `App.entitlements`.
   Switch `aps-environment` to `production` for App Store builds.

iOS cannot loop a ring past 30 s or draw a call-style screen for a
marketplace app (CallKit is for real calls only); the time-sensitive push
with the 29.5 s brand ringtone plus the WhatsApp/SMS/voice ladder covers it.

## Native code

- Android: `android/app/src/main/java/com/kavio/app/alerts/` (ported from
  ASK-O; `AlertConfig` holds the only Kavio-specific values: Indigo
  `#3D5AFE`, app name, icon). Channels are versioned (`*_v2`).
- iOS: `ios/App/App/AppDelegate.swift` (FCM token bridge), `sounds/`.
- Web side: `apps/web/lib/alerts/*` detects the plugin, so the same web build
  works in a browser, the PWA, and the app.
