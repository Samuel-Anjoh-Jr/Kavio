import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Kavio native app (Android + iOS).
 *
 * The shell loads the live Kavio app (apps/web, `/{locale}/app`) from the
 * server, so every web release reaches the app instantly with no store
 * update. Native code adds what the browser cannot do: FCM push that wakes a
 * closed app, a looping phone-call style ring for funded bookings and job
 * invitations (KavioAlerts plugin), full-screen ring on the lock screen, and
 * branded notification channels with the ASK-O brand sounds.
 *
 * KAVIO_APP_URL must be the production origin (e.g. https://kavio.cm) when
 * building a release; `/app` lets the locale middleware pick EN or FR.
 */
const origin = (process.env.KAVIO_APP_URL ?? 'https://kavio.cm').replace(/\/$/, '');
const isDev = origin.startsWith('http://');

const config: CapacitorConfig = {
  appId: 'com.kavio.app',
  appName: 'Kavio',
  // Shown only if the server cannot be reached on first launch.
  webDir: 'www',
  server: {
    url: `${origin}/app?source=native`,
    cleartext: isDev,
    androidScheme: isDev ? 'http' : 'https',
    allowNavigation: [new URL(origin).host],
    errorPath: 'index.html',
  },
  android: {
    allowMixedContent: isDev,
  },
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
  },
  plugins: {
    PushNotifications: {
      // iOS foreground presentation; Android draws its own via KavioAlerts.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
